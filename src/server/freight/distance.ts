// Distance for freight (spec §5.3, §6.4). Pure: no server-only imports, no I/O.

/** A place to measure from or to. A branch always has coordinates; a ship-to may not. */
export interface Place {lat:number|null;lng:number|null;address?:string|null}
export interface GeoPoint {lat:number;lng:number}

/**
 * Road miles between two places, rounded to 0.1 mi, or null when either end can't be located.
 * It is an interface so a routing API (Google, Mapbox) can replace the haversine estimate
 * later, and async because such an API is a network call.
 */
export interface DistanceProvider {roadMiles(from:Place,to:Place):Promise<number|null>}

export const EARTH_RADIUS_MILES=3958.8;
/** Straight-line miles x ROAD_FACTOR approximates driving miles (spec §5.3). */
export const ROAD_FACTOR=1.25;

/**
 * Rounds to one decimal, half up. Going through toPrecision first stops binary floating
 * point from rounding x.x5 down (14.95*10 is 149.49999999999997).
 */
export function round1(n:number){return Math.round(Number((n*10).toPrecision(12)))/10;}

/** Great-circle miles between two points. */
export function haversineMiles(a:GeoPoint,b:GeoPoint){
  const rad=(degrees:number)=>degrees*Math.PI/180;
  const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 2*EARTH_RADIUS_MILES*Math.asin(Math.min(1,Math.sqrt(h)));
}

/** Synchronous haversine road miles: straight-line x roadFactor, rounded to 0.1 mi. */
export function haversineRoadMiles(from:GeoPoint,to:GeoPoint,roadFactor=ROAD_FACTOR){return round1(haversineMiles(from,to)*roadFactor);}

const located=(place:Place):place is Place&GeoPoint=>Number.isFinite(place.lat)&&Number.isFinite(place.lng);

/** The MVP DistanceProvider: haversine x 1.25, rounded to 0.1 mi. Needs coordinates at both ends. */
export class HaversineRoadFactorProvider implements DistanceProvider {
  constructor(readonly roadFactor=ROAD_FACTOR){}
  async roadMiles(from:Place,to:Place){
    return located(from)&&located(to)?haversineRoadMiles(from,to,this.roadFactor):null;
  }
}

export const haversineRoadFactor:DistanceProvider=new HaversineRoadFactorProvider();
