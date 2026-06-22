import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { StatusBoard } from "./status-board";

describe("StatusBoard", () => {
  it("renders each product status", () => {
    render(
      createElement(StatusBoard, {
        statuses: [
          {
            value: "unmeasured",
            label: "未採寸",
            description: "採寸待ちの商品",
          },
          {
            value: "selling",
            label: "販売中",
            description: "店頭販売中の商品",
          },
        ],
      }),
    );

    expect(screen.getByRole("region", { name: "商品ステータス" })).toBeInTheDocument();
    expect(screen.getByText("未採寸")).toBeInTheDocument();
    expect(screen.getByText("販売中")).toBeInTheDocument();
  });
});
