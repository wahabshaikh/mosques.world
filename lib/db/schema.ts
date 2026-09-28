import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    verificationState: text("verification_state").notNull().default("none"),
    lastVerifiedAt: integer("last_verified_at"),
    iqamahSummaryJson: text("iqamah_summary_json"),
    mergedIntoId: text("merged_into_id"),
    googlePlaceId: text("google_place_id"),
    googleLatlngFetchedAt: integer("google_latlng_fetched_at"),
    createdBy: text("created_by"),
    amenityBits: integer("amenity_bits").notNull().default(0),
    accessNotes: text("access_notes"),
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
  osmSyncedAt: integer("osm_synced_at"),
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
  timesLiveSentAt: integer("times_live_sent_at"),
  unsubscribedAt: integer("unsubscribed_at"),
});

// better-auth core tables (field names are what better-auth expects).
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  role: text("role").notNull().default("user"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
  bio: text("bio"),
  homeCityLabel: text("home_city_label"),
  homeCountry: text("home_country"),
  trustLevel: integer("trust_level").notNull().default(0),
  trustOverride: integer("trust_override"),
  reputation: integer("reputation").notNull().default(0),
  acceptedCount: integer("accepted_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  guidelinesAcceptedAt: integer("guidelines_accepted_at"),
  profilePublic: integer("profile_public", { mode: "boolean" }).notNull().default(true),
  checkinsVisibility: text("checkins_visibility").notNull().default("public"),
  avatarKey: text("avatar_key"),
  deletedAt: integer("deleted_at"),
  usernameChangedAt: integer("username_changed_at"),
});

export const usernameHistory = sqliteTable("username_history", {
  oldUsername: text("old_username").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull(),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_user").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("account_user").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("verification_identifier").on(table.identifier)],
);

export const fact = sqliteTable(
  "fact",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id").notNull(),
    key: text("key").notNull(),
    qualifier: text("qualifier").notNull().default(""),
    currentCandidateId: text("current_candidate_id"),
    state: text("state").notNull().default("unknown"),
    confidence: real("confidence").notNull().default(0),
    lastConfirmedAt: integer("last_confirmed_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("fact_place_key").on(table.placeId, table.key, table.qualifier)],
);

export const factCandidate = sqliteTable("fact_candidate", {
  id: text("id").primaryKey(),
  factId: text("fact_id").notNull(),
  valueJson: text("value_json").notNull(),
  valueHash: text("value_hash").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  status: text("status").notNull().default("candidate"),
  score: real("score").notNull().default(0),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const vote = sqliteTable("vote", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  userId: text("user_id").notNull(),
  polarity: integer("polarity").notNull(),
  source: text("source").notNull().default("other"),
  weight: real("weight").notNull(),
  geoVerified: integer("geo_verified", { mode: "boolean" }).notNull().default(false),
  evidencePhotoId: text("evidence_photo_id"),
  createdAt: integer("created_at").notNull(),
});

export const activity = sqliteTable("activity", {
  id: text("id").primaryKey(),
  actorId: text("actor_id"),
  placeId: text("place_id"),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
  visibility: text("visibility").notNull().default("public"),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  revertsId: text("reverts_id"),
  revertedAt: integer("reverted_at"),
  createdAt: integer("created_at").notNull(),
});

export const report = sqliteTable("report", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  placeId: text("place_id"),
  reason: text("reason").notNull(),
  note: text("note"),
  reporterId: text("reporter_id"),
  status: text("status").notNull().default("open"),
  resolvedBy: text("resolved_by"),
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
});

export const photo = sqliteTable("photo", {
  id: text("id").primaryKey(),
  placeId: text("place_id"),
  purpose: text("purpose").notNull().default("place"),
  r2Key: text("r2_key"),
  variantKeysJson: text("variant_keys_json"),
  category: text("category").notNull().default("other"),
  width: integer("width"),
  height: integer("height"),
  blurhash: text("blurhash"),
  status: text("status").notNull().default("processing"),
  aiLabelsJson: text("ai_labels_json"),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: integer("created_at").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: integer("reviewed_at"),
});

export const placeDuplicateCandidate = sqliteTable("place_duplicate_candidate", {
  aId: text("a_id").notNull(),
  bId: text("b_id").notNull(),
  distanceM: integer("distance_m").notNull(),
  nameSimilarity: real("name_similarity").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at").notNull(),
});

export type PhotoRow = typeof photo.$inferSelect;
export type UserRow = typeof user.$inferSelect;
export type PlaceRow = typeof place.$inferSelect;
export type CityRow = typeof city.$inferSelect;

export const checkin = sqliteTable("checkin", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  placeId: text("place_id").notNull(),
  prayer: text("prayer").notNull(),
  localDate: text("local_date").notNull(),
  geoVerified: integer("geo_verified", { mode: "boolean" }).notNull().default(false),
  distanceM: integer("distance_m"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
});

export const userPlaceStat = sqliteTable("user_place_stat", {
  userId: text("user_id").notNull(),
  placeId: text("place_id").notNull(),
  firstAt: integer("first_at").notNull(),
  lastAt: integer("last_at").notNull(),
  count: integer("count").notNull().default(0),
});

export const userStat = sqliteTable("user_stat", {
  userId: text("user_id").primaryKey(),
  places: integer("places").notNull().default(0),
  countries: integer("countries").notNull().default(0),
  cities: integer("cities").notNull().default(0),
  continents: integer("continents").notNull().default(0),
  jumuahCountries: integer("jumuah_countries").notNull().default(0),
  fajrPlaces: integer("fajr_places").notNull().default(0),
  verifications: integer("verifications").notNull().default(0),
  placesAdded: integer("places_added").notNull().default(0),
  photos: integer("photos").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const badge = sqliteTable("badge", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  ruleJson: text("rule_json").notNull(),
});

export const userBadge = sqliteTable("user_badge", {
  userId: text("user_id").notNull(),
  badgeKey: text("badge_key").notNull(),
  awardedAt: integer("awarded_at").notNull(),
});

export const savedPlace = sqliteTable("saved_place", {
  userId: text("user_id").notNull(),
  placeId: text("place_id").notNull(),
  createdAt: integer("created_at").notNull(),
});
