// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import StudentsPage from "./StudentsPage";
import { useStudentSearch } from "../features/students";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { StudentSearchState } from "../features/students";
import type { StudentSearchResultItem } from "@digihostel/api-client-react";

vi.mock("../features/students", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/students")>()),
  useStudentSearch: vi.fn(),
}));
// Identity passthrough — this page's own debounce delay is not what these
// tests exercise (StudentsPage.test.tsx focuses on rendering/pagination/sort
// wiring, not timer behavior), matching the established convention of
// mocking only what a given test file needs to control.
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseStudentSearch = vi.mocked(useStudentSearch);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureItem(overrides: Partial<StudentSearchResultItem> = {}): StudentSearchResultItem {
  return {
    id: "s1",
    rollNumber: "TEST-001",
    fullName: "Jane Doe",
    hostelId: "h1",
    hostelName: "Kalinga",
    roomId: "r1",
    roomNumber: "101",
    ...overrides,
  };
}

function setup(items: StudentSearchResultItem[], overrides: Partial<StudentSearchState> = {}) {
  mockUseStudentSearch.mockReturnValue({
    result: { items, total: items.length, page: 1, pageSize: 20 },
    isLoading: false,
    isFetching: false,
    error: null,
    ...overrides,
  });
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: "h1",
    staffName: null,
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: () => true,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  } as never);
}

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/students"]}>
        <StudentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudentsPage", () => {
  it("renders real student rows from the search result", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("TEST-001")).toBeTruthy();
    expect(screen.getByText("Kalinga")).toBeTruthy();
  });

  it("shows an honest empty state when there is no query and no in-scope students", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("No students in your scope")).toBeTruthy();
  });

  it("shows a distinct empty state once a search query is entered and nothing matches", () => {
    setup([]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "zzz" } });
    expect(screen.getByText("No students match this search")).toBeTruthy();
  });

  it("shows an honest error state without fabricating data", () => {
    setup([], { error: { userMessage: "Something went wrong." } as never });
    renderPage();
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });

  it("shows a loading skeleton while the search is in flight", () => {
    setup([], { isLoading: true, result: null });
    renderPage();
    expect(screen.getByLabelText("Loading students")).toBeTruthy();
  });

  it("changing the search field resets to page 1 and calls the query with the new text", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "jane" } });
    const lastCall = mockUseStudentSearch.mock.calls.at(-1)![0];
    expect(lastCall.q).toBe("jane");
    expect(lastCall.page).toBe(1);
  });

  it("changing sort order calls the query with the new sort field/direction", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "rollNumber-desc" } });
    const lastCall = mockUseStudentSearch.mock.calls.at(-1)![0];
    expect(lastCall.sortBy).toBe("rollNumber");
    expect(lastCall.sortDir).toBe("desc");
  });

  it("shows pagination controls and total count once results exist", () => {
    setup([fixtureItem()], {
      result: { items: [fixtureItem()], total: 45, page: 1, pageSize: 20 },
    });
    renderPage();
    expect(screen.getByText(/45 students/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("Previous is disabled on page 1", () => {
    setup([fixtureItem()], {
      result: { items: [fixtureItem()], total: 45, page: 1, pageSize: 20 },
    });
    renderPage();
    const prevButton = screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement;
    expect(prevButton.disabled).toBe(true);
  });

  it("shows the caller's hostel scope indicator", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
  });
});
