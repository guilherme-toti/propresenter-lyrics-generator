/** A Drive problem the user can do something about, worded to be shown as-is. */
export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
