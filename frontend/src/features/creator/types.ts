import type { IdentityMode, Visibility } from "../../lib/api-types";

export type PollFormValue = {
  title: string;
  description: string;
  identityMode: IdentityMode;
  visibility: Visibility;
  accessPassword: string;
  options: string[];
  startsDate: string;
  startsTime: string;
  endsDate: string;
  endsTime: string;
};
