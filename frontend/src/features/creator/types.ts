import type { IdentityMode, SelectionMode, Visibility } from "../../lib/api-types";

export type PollFormValue = {
  title: string;
  description: string;
  identityMode: IdentityMode;
  visibility: Visibility;
  accessPassword: string;
  voteLimit: number | null;
  selectionMode: SelectionMode;
  allowLiveResults: boolean;
  options: string[];
  startsDate: string;
  startsTime: string;
  endsDate: string;
  endsTime: string;
};
