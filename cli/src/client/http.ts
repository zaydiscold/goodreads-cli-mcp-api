export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "goodreads-cli/1.0.0 (+https://github.com/zaydiscold/goodreads-cli-mcp-api)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export function goodreadsUrl(path: string, baseUrl = "https://www.goodreads.com"): string {
  return new URL(path, baseUrl).toString();
}
