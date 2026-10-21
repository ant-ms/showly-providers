import { FlwBaseProvider } from "./flwBase.js";
import type { ProviderOptions } from "./base.js";

export class MoviesJoyProvider extends FlwBaseProvider {
  readonly id = "moviesjoy";
  readonly name = "MoviesJoy";
  readonly baseUrl = "https://moviesjoy.bz";

  constructor(options?: ProviderOptions) {
    super(options);
  }
}
