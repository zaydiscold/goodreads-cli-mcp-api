export const FULL_TOOL_NAMES = [
  "goodreads_api_map_routes",
  "goodreads_route_search",
  "goodreads_browser_routes",
  "goodreads_shelves_discover",
  "goodreads_books_list",
  "goodreads_books_export",
  "goodreads_book_show",
  "goodreads_comments_list",
  "goodreads_messages_folders",
  "goodreads_messages_list",
  "goodreads_annotations_list",
  "goodreads_annotations_thoughts_plan",
  "goodreads_notes_inspect",
  "goodreads_notes_publicize_plan",
  "goodreads_notes_publicize",
  "goodreads_notes_hide",
  "goodreads_quotes_add",
  "goodreads_quotes_remove",
  "goodreads_quotes_reorder",
  "goodreads_recent_reading_list",
  "goodreads_recent_reading_notes",
  "goodreads_recent_reading_publicize_plan",
  "goodreads_recent_reading_publicize",
  "goodreads_bookshelf_move_plan",
  "goodreads_write_plan_notes_publicize",
  "goodreads_request_plan",
  "goodreads_request_execute",
  "goodreads_dynamic_inventory_guidance",
] as const;

export type GoodreadsToolName = (typeof FULL_TOOL_NAMES)[number];
export type McpProfile = "full" | "core" | "notes";

export const CORE_TOOL_NAMES = [
  "goodreads_route_search",
  "goodreads_shelves_discover",
  "goodreads_books_list",
  "goodreads_book_show",
  "goodreads_notes_inspect",
  "goodreads_notes_publicize_plan",
  "goodreads_notes_publicize",
  "goodreads_notes_hide",
] as const satisfies readonly GoodreadsToolName[];

export const NOTES_TOOL_NAMES = [
  "goodreads_route_search",
  "goodreads_book_show",
  "goodreads_annotations_list",
  "goodreads_annotations_thoughts_plan",
  "goodreads_notes_inspect",
  "goodreads_notes_publicize_plan",
  "goodreads_notes_publicize",
  "goodreads_notes_hide",
  "goodreads_recent_reading_list",
  "goodreads_recent_reading_notes",
  "goodreads_recent_reading_publicize_plan",
  "goodreads_recent_reading_publicize",
  "goodreads_write_plan_notes_publicize",
] as const satisfies readonly GoodreadsToolName[];

const PROFILE_TOOLS: Record<McpProfile, ReadonlySet<GoodreadsToolName>> = {
  full: new Set(FULL_TOOL_NAMES),
  core: new Set(CORE_TOOL_NAMES),
  notes: new Set(NOTES_TOOL_NAMES),
};

export function parseMcpProfile(value: string | undefined): McpProfile {
  const profile = value ?? "full";
  if (profile === "full" || profile === "core" || profile === "notes") return profile;
  throw new Error(
    `GOODREADS_MCP_PROFILE must be one of full, core, notes (received ${JSON.stringify(profile)})`,
  );
}

export function toolsForProfile(profile: McpProfile): ReadonlySet<GoodreadsToolName> {
  return PROFILE_TOOLS[profile];
}
