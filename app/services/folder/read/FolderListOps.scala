package services.folder.read

import java.util.UUID
import org.jooq.Record
import scala.concurrent.Future
import scala.collection.JavaConversions._
import services.Page
import services.folder.FolderService
import services.generated.Tables.FOLDER
import services.generated.tables.records.{FolderRecord, SharingPolicyRecord}

trait FolderListOps { self: FolderService =>

  /** 'ls'-like command, lists folders by an owner, in the root or a subdirectory **/
  def listFolders(owner: String, offset: Int, size: Int, parent: Option[UUID]): Future[Page[FolderRecord]] = 
    db.query { sql => 
      val startTime = System.currentTimeMillis

      val total = parent match {
        case Some(parentId) =>
          sql.selectCount()
             .from(FOLDER)
             .where(FOLDER.OWNER.equal(owner))
             .and(FOLDER.PARENT.equal(parentId))
             .fetchOne(0, classOf[Int])

        case None => // Root folder
          sql.selectCount()
             .from(FOLDER)
             .where(FOLDER.OWNER.equal(owner))
             .and(FOLDER.PARENT.isNull)
             .fetchOne(0, classOf[Int])
      }

      val items = parent match {
        case Some(parentId) =>
          sql.selectFrom(FOLDER)
            .where(FOLDER.OWNER.equal(owner))
            .and(FOLDER.PARENT.equal(parentId))
            .orderBy(FOLDER.TITLE.asc)
            .limit(size)
            .offset(offset)
            .fetch()
            .into(classOf[FolderRecord])

        case None => // Root folder
          sql.selectFrom(FOLDER)
            .where(FOLDER.OWNER.equal(owner))
            .and(FOLDER.PARENT.isNull)
            .orderBy(FOLDER.TITLE.asc)
            .limit(size)
            .offset(offset)
            .fetch()
            .into(classOf[FolderRecord])
      }

      Page(System.currentTimeMillis - startTime, total, offset, size, items)
    }  

  def listFoldersSharedWithMe(username: String, parent: Option[UUID]): Future[Page[(FolderRecord, SharingPolicyRecord)]] =
    db.query { sql =>

      // TODO implement proper totals count, offset, sorting
      val startTime = System.currentTimeMillis

      // Helper
      def asTuple(record: Record) = {
        val folder = record.into(classOf[FolderRecord])
        val policy = record.into(classOf[SharingPolicyRecord])
        (folder, policy)
      }

      val query = parent match {
        case Some(parentId) => 
          // Subfolder
          val query = 
            """
            SELECT * 
            FROM sharing_policy
              JOIN folder ON folder.id = sharing_policy.folder_id
            WHERE shared_with = ? AND parent = ?;
            """
          sql.resultQuery(query, username, parentId)

        case None => 
          // Root folder
          val query = 
            """
            SELECT 
              sharing_policy.*, 
              folder.*, 
              parent_sharing_policy.shared_with AS parent_shared
            FROM sharing_policy
              JOIN folder ON folder.id = sharing_policy.folder_id
              LEFT OUTER JOIN folder parent_folder ON parent_folder.id = folder.parent
              LEFT OUTER JOIN sharing_policy parent_sharing_policy ON parent_sharing_policy.folder_id = parent_folder.id
            WHERE 
              sharing_policy.shared_with = ? AND
              parent_sharing_policy IS NULL;
            """
          sql.resultQuery(query, username)
      }

      val records = query.fetchArray.map(asTuple)
      Page(System.currentTimeMillis - startTime, records.size, 0, records.size, records)
    }

}