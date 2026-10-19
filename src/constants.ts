const LOGS_BACKEND_URL = "https://logs.reclaimprotocol.org"
const APP_BACKEND_URL = "https://api.reclaimprotocol.org"
const ATTESTOR_NODE_URL = "wss://attestor.reclaimprotocol.org/ws"
const DEFAULT_EXPIRY_HOURS = 1;
const MAX_EXPIRY_HOURS = 72;
// Builder issues an org-scoped attestor authorization for zkFetch's Builder
// mode. See src/zkfetch.ts / src/utils.ts requestBuilderAuthorization.
const BUILDER_BASE_URL = "https://build.reclaimprotocol.org"



export { LOGS_BACKEND_URL, APP_BACKEND_URL, ATTESTOR_NODE_URL, DEFAULT_EXPIRY_HOURS, MAX_EXPIRY_HOURS, BUILDER_BASE_URL }