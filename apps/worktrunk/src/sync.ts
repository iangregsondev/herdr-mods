// The record `vp run herdr:sync` writes, and whether the panel should ask for a new sync.
// Pure: no `herdr` or `gpui` imports.
//
// The record is a JSON file in the Herdr app home:
//   { "layout": "iangregsondev", "from": "main", "version": "0.1.14" }
// `version` is the Herdr app version the layout was built from.
import { Option, Result } from "effect";
import { at, parseJson, text } from "worktrunk-mailbox";

export interface SyncRecord {
  /** The layout the sync wrote. */
  readonly layout: string;
  /** The Herdr app version it was built from. */
  readonly version: string;
}

export interface Notice {
  readonly title: string;
  readonly body: string;
}

const parseRecord = (raw: string): Option.Option<SyncRecord> =>
  Option.flatMap(Result.getSuccess(parseJson(raw)), (json) =>
    Option.all({ layout: text(at(json, "layout")), version: text(at(json, "version")) }),
  );

/**
 * The toast to show when the installed Herdr (`installed`) differs from the version the
 * sync record (`record`, the file's text) was built from. `told` is the installed version
 * the panel last showed this toast for, so it shows once per version. None when there is
 * no readable record, the versions match, or the installed version is unknown.
 */
export const syncNotice = (
  record: Option.Option<string>,
  installed: string,
  told: unknown,
): Option.Option<Notice> =>
  record.pipe(
    Option.flatMap(parseRecord),
    Option.filter((built) => installed !== "" && built.version !== installed),
    Option.filter(() => told !== installed),
    Option.map((built) => ({
      title: "Herdr updated: run herdr:sync",
      body: `Your "${built.layout}" layout was built from Herdr ${built.version}; Herdr is now ${installed}. Run \`vp run herdr:sync\` in herdr-mods.`,
    })),
  );
