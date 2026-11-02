import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ElectionPhaseBadge } from "../ElectionPhaseBadge";
import { LocaleProvider } from "../../../i18n/LocaleProvider";

  function renderWithI18n(ui: React.ReactNode, locale = "en") {
    localStorage.setItem("voting_locale", locale);
    return render(<LocaleProvider>{ui}</LocaleProvider>);
  }

  describe("ElectionPhaseBadge", () => {
      beforeEach(() => {
        localStorage.clear();
      });

      describe("English rendering", () => {
        it("renders canonical 5 phases correctly in English", () => {
          const { unmount } = renderWithI18n(<ElectionPhaseBadge phase="UPCOMING" />);
          expect(screen.getByText("Upcoming")).toBeInTheDocument();
          unmount();

            const { unmount: u2 } = renderWithI18n(<ElectionPhaseBadge phase="REGISTRATION" />);
            expect(screen.getByText("Registration")).toBeInTheDocument();
            u2();

            const { unmount: u3 } = renderWithI18n(<ElectionPhaseBadge phase="REVIEW" />);
            expect(screen.getByText("Roster review")).toBeInTheDocument();
            u3();

            const { unmount: u4 } = renderWithI18n(<ElectionPhaseBadge phase="VOTING" />);
            expect(screen.getByText("Official voting")).toBeInTheDocument();
            u4();

            const { unmount: u5 } = renderWithI18n(<ElectionPhaseBadge phase="RESULTS" />);
            expect(screen.getByText("Results notice")).toBeInTheDocument();
            u5();
          });

          it("renders legacy phase keys normalized to canonical English labels", () => {
            const { unmount } = renderWithI18n(<ElectionPhaseBadge phase="REGISTRATION_OPEN" />);
            expect(screen.getByText("Registration")).toBeInTheDocument();
            unmount();

            const { unmount: u2 } = renderWithI18n(<ElectionPhaseBadge phase="VOTING_OPEN" />);
            expect(screen.getByText("Official voting")).toBeInTheDocument();
            u2();

            const { unmount: u3 } = renderWithI18n(<ElectionPhaseBadge phase="CLOSED" />);
            expect(screen.getByText("Results notice")).toBeInTheDocument();
            u3();

            const { unmount: u4 } = renderWithI18n(<ElectionPhaseBadge phase="REVIEWING" />);
            expect(screen.getByText("Roster review")).toBeInTheDocument();
            u4();
          });
        });

          describe("Chinese rendering (5 Standard Names)", () => {
            it("renders strict 5 standard Chinese phase names", () => {
              const { unmount } = renderWithI18n(<ElectionPhaseBadge phase="UPCOMING" />, "zh");
              expect(screen.getByText("即将开放")).toBeInTheDocument();
              unmount();

              const { unmount: u2 } = renderWithI18n(<ElectionPhaseBadge phase="REGISTRATION" />, "zh");
              expect(screen.getByText("资格登记")).toBeInTheDocument();
              u2();

              const { unmount: u3 } = renderWithI18n(<ElectionPhaseBadge phase="REVIEW" />, "zh");
              expect(screen.getByText("名册审核")).toBeInTheDocument();
              u3();

              const { unmount: u4 } = renderWithI18n(<ElectionPhaseBadge phase="VOTING" />, "zh");
              expect(screen.getByText("正式投票")).toBeInTheDocument();
              u4();

              const { unmount: u5 } = renderWithI18n(<ElectionPhaseBadge phase="RESULTS" />, "zh");
              expect(screen.getByText("结果公示")).toBeInTheDocument();
              u5();
            });

            it("maps legacy phase values to strict 5 standard Chinese names", () => {
              const { unmount } = renderWithI18n(<ElectionPhaseBadge phase="DRAFT" />, "zh");
              expect(screen.getByText("即将开放")).toBeInTheDocument();
              unmount();

              const { unmount: u2 } = renderWithI18n(<ElectionPhaseBadge phase="REGISTRATION_OPEN" />, "zh");
              expect(screen.getByText("资格登记")).toBeInTheDocument();
              u2();

              const { unmount: u3 } = renderWithI18n(<ElectionPhaseBadge phase="REVIEWING" />, "zh");
              expect(screen.getByText("名册审核")).toBeInTheDocument();
              u3();

              const { unmount: u4 } = renderWithI18n(<ElectionPhaseBadge phase="VOTING_OPEN" />, "zh");
              expect(screen.getByText("正式投票")).toBeInTheDocument();
              u4();

              const { unmount: u5 } = renderWithI18n(<ElectionPhaseBadge phase="CLOSED" />, "zh");
              expect(screen.getByText("结果公示")).toBeInTheDocument();
              u5();
            });
          });
        });
