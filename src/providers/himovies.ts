import { FlwBaseProvider } from "./flwBase.js";
import type { ProviderOptions } from "./base.js";

export class HiMoviesProvider extends FlwBaseProvider {
  readonly id = "himovies";
  readonly name = "HiMovies";
  readonly baseUrl = "https://himovies.ac";

  constructor(options?: ProviderOptions) {
    super(options);
  }
}
