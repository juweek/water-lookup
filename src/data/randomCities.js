/**
 * A small, durable set of cities for the Random button.
 *
 * These places are resolved locally instead of asking a geocoder to invent a
 * random destination. Each city is present in the compiled EPA state indexes,
 * so the interaction remains useful even if the geocoding service changes.
 */
export const RANDOM_CITIES = [
  {
    query: "Atlanta, GA",
    name: "Atlanta, Georgia",
    city: "Atlanta",
    stateCode: "GA",
    latitude: 33.749,
    longitude: -84.388,
  },
  {
    query: "Austin, TX",
    name: "Austin, Texas",
    city: "Austin",
    stateCode: "TX",
    latitude: 30.2672,
    longitude: -97.7431,
  },
  {
    query: "Boston, MA",
    name: "Boston, Massachusetts",
    city: "Boston",
    stateCode: "MA",
    latitude: 42.3601,
    longitude: -71.0589,
  },
  {
    query: "Buffalo, NY",
    name: "Buffalo, New York",
    city: "Buffalo",
    stateCode: "NY",
    latitude: 42.8864,
    longitude: -78.8784,
  },
  {
    query: "Chicago, IL",
    name: "Chicago, Illinois",
    city: "Chicago",
    stateCode: "IL",
    latitude: 41.8781,
    longitude: -87.6298,
  },
  {
    query: "Denver, CO",
    name: "Denver, Colorado",
    city: "Denver",
    stateCode: "CO",
    latitude: 39.7392,
    longitude: -104.9903,
  },
  {
    query: "Detroit, MI",
    name: "Detroit, Michigan",
    city: "Detroit",
    stateCode: "MI",
    latitude: 42.3314,
    longitude: -83.0458,
  },
  {
    query: "Kansas City, MO",
    name: "Kansas City, Missouri",
    city: "Kansas City",
    stateCode: "MO",
    latitude: 39.0997,
    longitude: -94.5786,
  },
  {
    query: "Los Angeles, CA",
    name: "Los Angeles, California",
    city: "Los Angeles",
    stateCode: "CA",
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    query: "Miami, FL",
    name: "Miami, Florida",
    city: "Miami",
    stateCode: "FL",
    latitude: 25.7617,
    longitude: -80.1918,
  },
  {
    query: "Minneapolis, MN",
    name: "Minneapolis, Minnesota",
    city: "Minneapolis",
    stateCode: "MN",
    latitude: 44.9778,
    longitude: -93.265,
  },
  {
    query: "New Orleans, LA",
    name: "New Orleans, Louisiana",
    city: "New Orleans",
    stateCode: "LA",
    latitude: 29.9511,
    longitude: -90.0715,
  },
  {
    query: "Philadelphia, PA",
    name: "Philadelphia, Pennsylvania",
    city: "Philadelphia",
    stateCode: "PA",
    latitude: 39.9526,
    longitude: -75.1652,
  },
  {
    query: "Phoenix, AZ",
    name: "Phoenix, Arizona",
    city: "Phoenix",
    stateCode: "AZ",
    latitude: 33.4484,
    longitude: -112.074,
  },
  {
    query: "Portland, OR",
    name: "Portland, Oregon",
    city: "Portland",
    stateCode: "OR",
    latitude: 45.5152,
    longitude: -122.6784,
  },
  {
    query: "Seattle, WA",
    name: "Seattle, Washington",
    city: "Seattle",
    stateCode: "WA",
    latitude: 47.6062,
    longitude: -122.3321,
  },
  {
    query: "Washington, DC",
    name: "Washington, District of Columbia",
    city: "Washington",
    stateCode: "DC",
    latitude: 38.9072,
    longitude: -77.0369,
  },
];

function normalizeQuery(value) {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

export function getCuratedCity(query) {
  const key = normalizeQuery(query);
  const city = RANDOM_CITIES.find((item) => normalizeQuery(item.query) === key);
  return city ? { ...city, zip: null } : null;
}
