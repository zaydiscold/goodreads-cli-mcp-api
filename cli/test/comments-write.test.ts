import { afterEach, expect, it, vi } from "vitest";
import { commentCreate } from "../src/workflows/comments.js";
import { executeLiveRequest } from "../src/client/live.js";
import { fetchAuthenticatedText } from "../src/client/http.js";

vi.mock("../src/client/live.js", async (original) => ({
  ...(await original<typeof import("../src/client/live.js")>()),
  executeLiveRequest: vi.fn(),
}));
vi.mock("../src/client/http.js", async (original) => ({
  ...(await original<typeof import("../src/client/http.js")>()),
  fetchAuthenticatedText: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

it("previews offline and requires exact approvals", async () => {
  const result = await commentCreate({ reviewId: "123", text: "Synthetic comment" });
  expect(result.data).toMatchObject({
    submitted: false,
    outcome: "planned",
    mutationVerified: false,
  });
  expect(JSON.stringify(result)).not.toContain("Synthetic comment");
  expect(fetchAuthenticatedText).not.toHaveBeenCalled();
  const blocked = await commentCreate({
    reviewId: "123",
    text: "Synthetic comment",
    execute: true,
    approvedReviewId: "999",
  });
  expect(blocked.data).toMatchObject({ outcome: "blocked" });
  expect(executeLiveRequest).not.toHaveBeenCalled();
});

it("checks the exact review form and never calls HTTP acceptance verification", async () => {
  const input = { reviewId: "123", text: "Synthetic comment" };
  const preview = await commentCreate(input);
  const options = {
    ...input,
    execute: true,
    approvedReviewId: "123",
    approvedTextSha256: (preview.data as { textSha256: string }).textSha256,
  };
  vi.mocked(fetchAuthenticatedText).mockResolvedValue({
    signedOut: false,
    html: '<form action="/comment"><input name="id" value="999"><input name="type" value="review"><textarea name="comment[body_usertext]"></textarea></form>',
  });
  await expect(commentCreate(options)).rejects.toThrow(/Exact review/);
  expect(executeLiveRequest).not.toHaveBeenCalled();
  vi.mocked(fetchAuthenticatedText).mockResolvedValue({
    signedOut: false,
    html: '<form action="https://www.goodreads.com/comment"><input name="id" value="123"><input name="type" value="review"><textarea name="comment[body_usertext]"></textarea></form>',
  });
  vi.mocked(executeLiveRequest).mockResolvedValue({
    requestAccepted: true,
    redirectLocation: "/review/show/123?private_token=synthetic-private",
    mutationVerified: false,
  } as never);
  const receipt = await commentCreate(options);
  expect(JSON.stringify(receipt)).not.toContain("synthetic-private");
  expect(receipt.data).toMatchObject({
    submitted: true,
    mutationVerified: false,
    retrySafe: false,
    outcome: "submitted_unverified",
  });
  expect(executeLiveRequest).toHaveBeenCalledWith(
    expect.objectContaining({ path: "/comment" }),
    expect.objectContaining({
      form: expect.objectContaining({ id: "123", type: "review", update_feed: "0" }),
    }),
  );
});
