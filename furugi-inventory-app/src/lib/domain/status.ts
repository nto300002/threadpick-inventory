export const PRODUCT_STATUS_VALUES = [
  "unmeasured",
  "measured",
  "selling",
  "sold",
  "returned",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUS_VALUES)[number];

export type ProductStatusDefinition = {
  value: ProductStatus;
  label: string;
  description: string;
};

export const PRODUCT_STATUSES: ProductStatusDefinition[] = [
  {
    value: "unmeasured",
    label: "未採寸",
    description: "商品登録後、採寸作業を待っている状態",
  },
  {
    value: "measured",
    label: "採寸済み",
    description: "採寸が完了し、販売前確認を行う状態",
  },
  {
    value: "selling",
    label: "販売中",
    description: "店頭で販売している状態",
  },
  {
    value: "sold",
    label: "売却済み",
    description: "販売が完了し、履歴として確認する状態",
  },
  {
    value: "returned",
    label: "返品",
    description: "返品が発生した商品を保持する状態",
  },
];

export function isProductStatus(value: string): value is ProductStatus {
  return PRODUCT_STATUS_VALUES.includes(value as ProductStatus);
}
