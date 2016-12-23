package transform.georesolution

import akka.actor.Actor
import java.io.File
import java.util.UUID
import kantan.csv.ops._
import kantan.codecs.Result.Success
import models.ContentType
import models.annotation._
import models.place.PlaceService
import models.task.{ TaskService, TaskStatus }
import models.generated.tables.records.{ DocumentRecord, DocumentFilepartRecord }
import org.joda.time.DateTime
import scala.concurrent.{ Await, ExecutionContext }
import scala.concurrent.duration._
import storage.ES

private[georesolution] class GeoresolutionWorkerActor(
    document: DocumentRecord,
    part: DocumentFilepartRecord,
    documentDir: File, 
    taskService: TaskService,
    annotationService: AnnotationService,
    placeService: PlaceService,
    implicit val ctx: ExecutionContext) extends Actor {    
  
  import transform.TransformTaskMessages._ 
  
  def receive = {

    case Start => {
      val origSender = sender
      
      val taskId = Await.result(
        taskService.insertTask(
          GeoresolutionService.TASK_TYPE,
          this.getClass.getName,
          Some(document.getId),
          Some(part.getId),
          Some(document.getOwner)),
        10.seconds)
        
      taskService.updateStatusAndProgress(taskId, TaskStatus.RUNNING, 1)

      try {
        val totalResolvablePlaces = parse().size
        resolve(parse(), totalResolvablePlaces, taskId)        
        taskService.setCompleted(taskId)
        origSender ! Stopped
      } catch { case t: Throwable =>
        t.printStackTrace()
        taskService.setFailed(taskId, Some(t.getMessage))
        origSender ! Stopped
      }
    }

  }
  
  // TODO fix!
  private def parse() =
    new File(documentDir, part.getFile).asCsvReader[List[String]](sep = ',', header = true).map {
      case Success(line) =>
        val toponym = line(9).trim()
        if (toponym.size > 0)
          Some(Georesolvable("", toponym, None))
        else
          None
          
      case _ => None
    }
  
  private def resolve(resolvables: TraversableOnce[Option[Georesolvable]], total: Int, taskId: UUID) = {
    
    def resolveOne(resolvable: Georesolvable, anchor: String) = {
      placeService.searchPlaces(ES.sanitize(resolvable.toponym), 0, 1).map { topHits =>
        if (topHits.total > 0)
          // TODO be smarter about choosing the right URI from the place
          toAnnotation(anchor, resolvable, Some(topHits.items(0)._1.id))         
        else
          // No gazetteer match found
          toAnnotation(anchor, resolvable, None)
      }.recover { case t: Throwable =>
        t.printStackTrace()
        toAnnotation(anchor, resolvable, None)
      }
    }
    
    var counter = 0
    var progress = 0
    
    resolvables.foreach { maybeResolvable =>
      
      maybeResolvable match {
        case Some(resolvable) =>
          val f = for {
            annotation <- resolveOne(resolvable, "row:" + counter)
            (success, _, _) <- annotationService.insertOrUpdateAnnotation(annotation)
          } yield (success)
          
          Await.result(f, 10.seconds)
          
        case None => // Skip
      }
      
      counter += 1
      val p = 100 * counter / total
      if (p > progress) {
        taskService.updateProgress(taskId, p)
        progress = p
      } 
    }
    
  }
  
  /** TODO how to handle anchor?
    * TODO how to make re-usable for NERWorkerActor?
    */
  private def toAnnotation(anchor: String, resolvable: Georesolvable, uri: Option[String]) = {
    val now = new DateTime()
    Annotation(
      UUID.randomUUID,
      UUID.randomUUID,
      AnnotatedObject(document.getId, part.getId, ContentType.withName(part.getContentType).get),
      Seq.empty[String], // No contributors
      anchor,
      None, // No last modifying user
      now,
      Seq(
        AnnotationBody(
          AnnotationBody.QUOTE,
          None, // No last modifying user
          now,
          Some(resolvable.toponym),
          None,
          None
        ),
        AnnotationBody(
          AnnotationBody.PLACE,
          None,
          now,
          None,
          uri,
          Some(AnnotationStatus(AnnotationStatus.UNVERIFIED, None,now))
        )
      )
    )
  }
  
}