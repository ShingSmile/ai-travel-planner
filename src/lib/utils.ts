/**
 * 拼接可选的 className 字符串，忽略空值。
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
