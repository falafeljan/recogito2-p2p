/**
 * This class is generated by jOOQ
 */
package models.generated


import javax.annotation.Generated

import models.generated.tables.Documents
import models.generated.tables.SqliteSequence
import models.generated.tables.Users


/**
 * Convenience access to all tables in 
 */
@Generated(
	value = Array(
		"http://www.jooq.org",
		"jOOQ version:3.7.2"
	),
	comments = "This class is generated by jOOQ"
)
object Tables {

	/**
	 * The table documents
	 */
	val DOCUMENTS = models.generated.tables.Documents.DOCUMENTS

	/**
	 * The table sqlite_sequence
	 */
	val SQLITE_SEQUENCE = models.generated.tables.SqliteSequence.SQLITE_SEQUENCE

	/**
	 * The table users
	 */
	val USERS = models.generated.tables.Users.USERS
}
