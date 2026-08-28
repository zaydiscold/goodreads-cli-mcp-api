export type Confidence = "high" | "medium" | "low";

export interface CommandEnvelope<T> {
  source: "goodreads-web";
  accountUserId?: string;
  accountUserSlug?: string;
  generatedAt: string;
  confidence: Confidence;
  warnings: string[];
  data: T;
}

export interface ShelfInventoryItem {
  slug: string;
  displayName: string;
  count: number | null;
  href: string;
  kind: "account_shelf" | "account_all_books";
  isObservedForThisAccount: boolean;
}

export interface ShelfBookRow {
  reviewId: string | null;
  bookId: string | null;
  title: string | null;
  bookHref: string | null;
  author: string | null;
  ratingText: string | null;
  shelfText: string | null;
}

export interface PageLink {
  page: number | null;
  label: string;
  href: string;
}

export interface ShelfHtmlParse {
  kind: "shelf_html";
  title: string | null;
  declaredBookCount: number | null;
  currentPage: number | null;
  pageLinks: PageLink[];
  shelfInventory: ShelfInventoryItem[];
  rows: ShelfBookRow[];
}

export interface ShelfRssItem {
  title: string | null;
  link: string | null;
  guid: string | null;
  bookId: string | null;
  authorName: string | null;
  isbn: string | null;
  userRating: number | null;
  userReadAt: string | null;
  userDateAdded: string | null;
  userDateCreated: string | null;
  userShelves: string | null;
  averageRating: string | null;
  bookPublished: string | null;
  hasBookDescription: boolean;
  bookDescriptionLength: number;
  hasUserReview: boolean;
  userReviewLength: number;
}

export interface ShelfRssParse {
  kind: "shelf_rss";
  channelTitle: string | null;
  itemCount: number;
  items: ShelfRssItem[];
  signals: {
    rssMayCapAt100: boolean;
  };
}

export interface PaginationSummary {
  mode: "auto";
  pagesSeen: number[];
  declaredCount: number | null;
  parsedCount: number;
  complete: boolean;
}

export interface BookPageParse {
  kind: "book_page";
  title: string | null;
  jsonLdBook: {
    name: string | null;
    bookFormat: string | null;
    numberOfPages: number | string | null;
    inLanguage: string | null;
    authors: string[];
    ratingValue: string | number | null;
    ratingCount: string | number | null;
    reviewCount: string | number | null;
  };
  hasNextData: boolean;
  nextDataTopLevelKeys: string[];
  nextDataTypenames: Record<string, number>;
}

export interface NotesPageParse {
  kind: "notes_page";
  title: string | null;
  annotationCount: number;
  highlightCount: number;
  attachedNoteCount: number;
  latestTimestamp: string | null;
  noteCount: number;
  visibleNoteCount: number;
  hiddenNoteCount: number;
  notePersistEndpointCount: number;
  spoilerToggleCount: number;
  shelfGateDetected: boolean;
  visibleCounts: Record<string, number>;
  notes: Array<{
    annotationPairId: string | null;
    visible: string | null;
    notePersistEndpoint: string | null;
    hasSpoilerToggle: boolean;
  }>;
  noteBookLinks: Array<{
    href: string;
    bookSlug: string | null;
    bookId: string | null;
    userSlug: string | null;
    labelLength: number;
  }>;
}

export interface MessagePageParse {
  kind: "message_page";
  title: string | null;
  folders: Array<{
    slug: string;
    href: string;
  }>;
  messageLinks: Array<{
    messageId: string | null;
    href: string;
    labelLength: number;
    hasVisibleLabel: boolean;
  }>;
  forms: Array<{
    method: string;
    action: string;
    inputNames: string[];
  }>;
}
