// Ink imports react-devtools-core (an optional peer) only when DEV=true.
// Bundlers still need it to resolve, so builds alias it to this no-op (see tsconfig `paths`).
export default {
  initialize() {},
  connectToDevTools() {},
};
