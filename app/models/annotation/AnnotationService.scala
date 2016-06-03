package models.annotation

import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.{ HitAs, RichSearchHit }
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.source.Indexable
import java.util.UUID
import play.api.Logger
import play.api.libs.json.Json
import scala.concurrent.{ ExecutionContext, Future }
import scala.language.postfixOps
import storage.ES
import models.geotag.ESGeoTagStore

object AnnotationService extends ESGeoTagStore {

  private val ANNOTATION = "annotation"
  
  // Maximum number of times an annotation (batch) will be retried in case of failure 
  private def MAX_RETRIES = 10

  implicit object AnnotationIndexable extends Indexable[Annotation] {
    override def json(a: Annotation): String = Json.stringify(Json.toJson(a))
  }

  implicit object AnnotationHitAs extends HitAs[(Annotation, Long)] {
    override def as(hit: RichSearchHit): (Annotation, Long) =
      (Json.fromJson[Annotation](Json.parse(hit.sourceAsString)).get, hit.version)
  }
  
  def insertOrUpdateAnnotation(annotation: Annotation)(implicit context: ExecutionContext): Future[(Boolean, Long)] = {
    def upsertAnnotation(a: Annotation): Future[(Boolean, Long)] = {
      ES.client execute {
        update id a.annotationId in ES.IDX_RECOGITO / ANNOTATION source a docAsUpsert
      } map { r =>
        (true, r.getVersion)
      } recover { case t: Throwable =>
        Logger.error("Error indexing annotation " + annotation.annotationId + ": " + t.getMessage)
        t.printStackTrace
        (false, -1l)
      }
    }
    
    for {
      (annotationCreated, version) <- upsertAnnotation(annotation)
      linksCreated <- if (annotationCreated) insertOrUpdateGeoTagsForAnnotation(annotation) else Future.successful(false)
    } yield (linksCreated, version)    
  }

  def insertOrUpdateAnnotations(annotations: Seq[Annotation], retries: Int = MAX_RETRIES)(implicit context: ExecutionContext): Future[Seq[Annotation]] = {
    annotations.foldLeft(Future.successful(Seq.empty[Annotation])) { case (future, annotation) =>
      future.flatMap { failedAnnotations =>
        insertOrUpdateAnnotation(annotation).map { case (success, version) =>
          if (success)
            failedAnnotations
          else
            failedAnnotations :+ annotation
        }
      }
    } flatMap { failed =>
      if (failed.size > 0 && retries > 0) {
        Logger.warn(failed.size + " annotations failed to import - retrying")
        insertOrUpdateAnnotations(failed, retries - 1)
      } else {
        Logger.info("Successfully imported " + (annotations.size - failed.size) + " annotations")  
        if (failed.size > 0)
          Logger.error(failed.size + " annotations failed without recovery")
        else
          Logger.info("No failed imports")
        Future.successful(failed)
      }
    }
  }

  def findById(annotationId: UUID)(implicit context: ExecutionContext): Future[Option[(Annotation, Long)]] = {
    ES.client execute {
      get id annotationId.toString from ES.IDX_RECOGITO / ANNOTATION 
    } map { response =>
      if (response.isExists) {
        val source = Json.parse(response.getSourceAsString)
        Some((Json.fromJson[Annotation](source).get, response.getVersion))    
      } else {
        None
      }
    }
  }
    
  def deleteAnnotation(annotationId: UUID)(implicit context: ExecutionContext): Future[Boolean] =
    ES.client execute {
      delete id annotationId.toString from ES.IDX_RECOGITO / ANNOTATION
    } flatMap { response =>
      if (response.isFound)
        deleteGeoTagsByAnnotation(annotationId)
      else
        Future.successful(false)
    } recover { case t: Throwable =>
      t.printStackTrace()
      false
    }    
  
  def findByDocId(id: String, limit: Int = Integer.MAX_VALUE)(implicit context: ExecutionContext): Future[Seq[(Annotation, Long)]] = {
    ES.client execute {
      search in ES.IDX_RECOGITO / ANNOTATION query nestedQuery("annotates").query(termQuery("annotates.document_id" -> id)) limit limit
    } map(_.as[(Annotation, Long)].toSeq)
  }
  
  /** Unfortunately, ElasticSearch doesn't support delete-by-query directly, so this is a two-step-process **/
  def deleteByDocId(docId: String)(implicit context: ExecutionContext): Future[Boolean] =
    findByDocId(docId).flatMap { annotationsAndVersions =>
      if (annotationsAndVersions.size > 0) {
        ES.client execute {
          bulk ( annotationsAndVersions.map { case (annotation, _) => delete id annotation.annotationId from ES.IDX_RECOGITO / ANNOTATION } )
        } map {
          !_.hasFailures
        } recover { case t: Throwable =>
          t.printStackTrace()
          false
        }
      } else {
        // Nothing to delete
        Future.successful(true)
      }
    }
  
  def findByFilepartId(id: Int, limit: Int = Integer.MAX_VALUE)(implicit context: ExecutionContext): Future[Seq[(Annotation, Long)]] = {
    ES.client execute {
      search in ES.IDX_RECOGITO / ANNOTATION query nestedQuery("annotates").query(termQuery("annotates.filepart_id" -> id)) limit limit
    } map(_.as[(Annotation, Long)].toSeq)
  }

}
