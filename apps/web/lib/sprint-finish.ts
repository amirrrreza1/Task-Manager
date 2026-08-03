/** Whether finishing today would happen on a different day than the target end date. */
export function needsSprintFinishConfirmation(
  endsAt: string | null,
  today = new Date(),
  formatDay = (value: string | Date) => new Date(value).toLocaleDateString(),
) {
  return Boolean(endsAt && formatDay(endsAt) !== formatDay(today));
}
