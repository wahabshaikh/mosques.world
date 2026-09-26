import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const place = sqliteTable(
  "place",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    nameLocal: text("name_local"),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("active"),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    geohash6: text("geohash6").notNull(),
    address: text("address"),
    locality: text("locality"),
    region: text("region"),
    countryCode: text("country_code").notNull(),
    citySlug: text("city_slug").notNull(),
    timezone: text("timezone").notNull(),
    calcMethod: text("calc_method").notNull(),
    asrMadhab: text("asr_madhab").notNull(),
    osmType: text("osm_type"),
    osmId: integer("osm_id"),
    website: text("website"),
    phone: text("phone"),
    wheelchair: text("wheelchair"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("place_osm").on(table.osmType, table.osmId)],
);

export const city = sqliteTable("city", {
  countryCode: text("country_code").notNull(),
  citySlug: text("city_slug").notNull(),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  placeCount: integer("place_count").notNull().default(0),
  bboxJson: text("bbox_json"),
});

export const calcDefault = sqliteTable("calc_default", {
  countryCode: text("country_code").primaryKey(),
  calcMethod: text("calc_method").notNull(),
  asrMadhab: text("asr_madhab").notNull(),
  highLatRule: text("high_lat_rule").notNull(),
});

export const waitlist = sqliteTable("waitlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  placeId: text("place_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  confirmedAt: integer("confirmed_at"),
});

export type PlaceRow = typeof place.$inferSelect;
export type CityRow = typeof city.$inferSelect;
