/**
 * This class is generated by jOOQ
 */
package models.generated.tables


import java.lang.Class
import java.lang.String
import java.time.OffsetDateTime
import java.util.Arrays
import java.util.List

import javax.annotation.Generated

import models.generated.DefaultSchema
import models.generated.Keys
import models.generated.tables.records.UsersRecord

import org.jooq.Field
import org.jooq.Table
import org.jooq.TableField
import org.jooq.UniqueKey
import org.jooq.impl.TableImpl


object Users {

	/**
	 * The reference instance of <code>users</code>
	 */
	val USERS = new Users
}

/**
 * This class is generated by jOOQ.
 */
@Generated(
	value = Array(
		"http://www.jooq.org",
		"jOOQ version:3.7.2"
	),
	comments = "This class is generated by jOOQ"
)
class Users(alias : String, aliased : Table[UsersRecord], parameters : Array[ Field[_] ]) extends TableImpl[UsersRecord](alias, DefaultSchema.DEFAULT_SCHEMA, aliased, parameters, "") {

	/**
	 * The class holding records for this type
	 */
	override def getRecordType : Class[UsersRecord] = {
		classOf[UsersRecord]
	}

	/**
	 * The column <code>users.username</code>.
	 */
	val USERNAME : TableField[UsersRecord, String] = createField("username", org.jooq.impl.SQLDataType.VARCHAR, "")

	/**
	 * The column <code>users.email</code>.
	 */
	val EMAIL : TableField[UsersRecord, String] = createField("email", org.jooq.impl.SQLDataType.VARCHAR.nullable(false), "")

	/**
	 * The column <code>users.password_hash</code>.
	 */
	val PASSWORD_HASH : TableField[UsersRecord, String] = createField("password_hash", org.jooq.impl.SQLDataType.VARCHAR, "")

	/**
	 * The column <code>users.salt</code>.
	 */
	val SALT : TableField[UsersRecord, String] = createField("salt", org.jooq.impl.SQLDataType.VARCHAR, "")

	/**
	 * The column <code>users.member_since</code>.
	 */
	val MEMBER_SINCE : TableField[UsersRecord, OffsetDateTime] = createField("member_since", org.jooq.impl.SQLDataType.TIMESTAMPWITHTIMEZONE.nullable(false), "")

	/**
	 * Create a <code>users</code> table reference
	 */
	def this() = {
		this("users", null, null)
	}

	/**
	 * Create an aliased <code>users</code> table reference
	 */
	def this(alias : String) = {
		this(alias, models.generated.tables.Users.USERS, null)
	}

	private def this(alias : String, aliased : Table[UsersRecord]) = {
		this(alias, aliased, null)
	}

	override def getPrimaryKey : UniqueKey[UsersRecord] = {
		Keys.PK_USERS
	}

	override def getKeys : List[ UniqueKey[UsersRecord] ] = {
		return Arrays.asList[ UniqueKey[UsersRecord] ](Keys.PK_USERS)
	}

	override def as(alias : String) : Users = {
		new Users(alias, this)
	}

	/**
	 * Rename this table
	 */
	def rename(name : String) : Users = {
		new Users(name, null)
	}
}
