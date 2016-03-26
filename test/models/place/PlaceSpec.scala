package models.place

import com.vividsolutions.jts.geom.Coordinate
import org.specs2.mutable._
import org.specs2.runner._
import org.joda.time.format.DateTimeFormat
import org.junit.runner._
import play.api.Logger
import play.api.test._
import play.api.test.Helpers._
import play.api.libs.json.Json
import scala.io.Source

import org.joda.time.DateTime

@RunWith(classOf[JUnitRunner])
class PlaceSpec extends Specification {

  private val DATE_TIME_PATTERN = DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ssZ")
  
  "sample place" should {
    
    "be properly created from JSON" in {
      val json = Source.fromFile("test/resources/place.json").getLines().mkString("\n")
      val parseResult = Json.fromJson[Place](Json.parse(json))
      
      parseResult.isSuccess must equalTo(true)
      
      val place = parseResult.get
      
      place.id must equalTo ("http://pleiades.stoa.org/places/118543")
      
      val expectedURIs = Seq(
          "http://pleiades.stoa.org/places/118543",
          "http://dare.ht.lu.se/places/10778",
          "http://www.trismegistos.org/place/35191")          
      place.uris must containAllOf(expectedURIs)

      place.title must equalTo("Ad Mauros")

      place.placeTypes.size must equalTo(2)
      place.placeTypes.map(_.placeType) must containAllOf(Seq("fort", "tower"))
      
      place.descriptions.size must equalTo(1)
      place.descriptions.head must equalTo(Description("An ancient place, cited: BAtlas 12 H4 Ad Mauros", None, Gazetteer("Pleiades")))
      
      val expectedNames = Seq(
          Name("Ad Mauros", None, Seq(Gazetteer("Pleiades"), Gazetteer("Trismegistos"))),
          Name("Ad Mauros/Marinianio, Eferding", None, Seq(Gazetteer("DARE"))),
          Name("Eferding", None, Seq(Gazetteer("Trismegistos"))),
          Name("Marianianio", Some("la"), Seq(Gazetteer("Trismegistos"))))
          
      place.names must containAllOf(expectedNames)
      
      place.representativePoint must equalTo(Some(new Coordinate(14.02358, 48.31058)))

      /*
      "geometry": {
        "type": "point",
        "coordinates": [ 14.02358, 48.31058 ]
      }
      */
      
      val from = new DateTime(-30, 1, 1, 0, 0)
      val to = new DateTime(640, 1, 1, 0, 0)
      place.temporalBounds must equalTo(TemporalBounds(from, to))

      /*
      "close_matches": [
        "http://sws.geonames.org/2780394",
        "http://www.wikidata.org/entity/Q2739862",
        "http://de.wikipedia.org/wiki/Kastell_Eferding",
        "http://www.cambridge.org/us/talbert/talbertdatabase/TPPlace1513.html"
      ]
      */
    }
    
  }
  
}