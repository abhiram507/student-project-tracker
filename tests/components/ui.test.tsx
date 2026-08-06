// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// AuthForm needs a router; nothing here navigates, so a stub is enough.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

const { AuthForm } = await import("@/components/AuthForm");
const { TaskLedger } = await import("@/components/TaskLedger");
const { ReviewStateChip, ProjectStatusChip } = await import("@/components/StatusChip");

describe("AuthForm", () => {
  /**
   * Regression guard. This form previously read its post-login destination
   * from `useSearchParams()`, which opted the subtree into client-only
   * rendering and shipped a login page whose HTML contained no form. If
   * someone reintroduces a client-only hook here, rendering without a
   * Suspense boundary starts failing and this test catches it.
   */
  it("renders the sign-in fields", () => {
    render(<AuthForm mode="login" />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("asks for a name only when registering", () => {
    const { unmount } = render(<AuthForm mode="login" />);
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
    unmount();

    render(<AuthForm mode="register" />);
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("marks the password field so browsers offer the right autofill", () => {
    render(<AuthForm mode="register" />);
    const password = screen.getByLabelText(/password/i);

    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
  });

  it("offers a route to the other form", () => {
    render(<AuthForm mode="login" />);
    expect(screen.getByRole("link", { name: /create one/i })).toHaveAttribute("href", "/register");
  });
});

describe("TaskLedger", () => {
  it("invites action rather than showing an empty bar when there are no tasks", () => {
    render(<TaskLedger counts={{ total: 0, todo: 0, inProgress: 0, done: 0 }} progress={0} />);
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });

  it("spells the counts out for a screen reader instead of relying on the bar", () => {
    render(<TaskLedger counts={{ total: 4, todo: 1, inProgress: 1, done: 2 }} progress={63} />);

    const bar = screen.getByRole("img");
    expect(bar).toHaveAccessibleName(/63% complete/);
    expect(bar).toHaveAccessibleName(/2 done/);
    expect(bar).toHaveAccessibleName(/1 in progress/);
    expect(bar).toHaveAccessibleName(/1 to do/);
  });
});

describe("status chips", () => {
  it("always carries a text label, so colour is never the only signal", () => {
    const { unmount } = render(<ReviewStateChip state="CHANGES_REQUESTED" />);
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
    unmount();

    render(<ProjectStatusChip status="IN_PROGRESS" />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("uses human wording rather than the raw enum", () => {
    render(<ReviewStateChip state="SUBMITTED" />);
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.queryByText("SUBMITTED")).not.toBeInTheDocument();
  });
});
