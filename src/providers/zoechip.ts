import { FlwBaseProvider } from "./flwBase.js";
import type { ProviderOptions } from "./base.js";

export class ZoechipProvider extends FlwBaseProvider {
  readonly id = "zoechip";
  readonly name = "Zoechip";
  readonly baseUrl = "https://zoechip.bz";

  constructor(options?: ProviderOptions) {
    super(options);
  }
}
