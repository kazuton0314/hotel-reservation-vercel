/** URLSearchParams → ListPagination 用の plain object */
export function searchParamsToRecord(
  searchParams: URLSearchParams
): Record<string, string | undefined> {
  const record: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}
