// The HealthKit entitlement and usage string live with the module that needs them,
// so `expo prebuild --clean` regenerates them every time instead of losing them.
const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

const DEFAULT_UPDATE_USAGE =
  "Writes the rides you choose — power, cadence, speed, distance, heart rate and energy — into Apple Health.";

module.exports = function withHealthWrite(config, { updateUsage = DEFAULT_UPDATE_USAGE } = {}) {
  config = withEntitlementsPlist(config, (c) => {
    c.modResults["com.apple.developer.healthkit"] = true;
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults.NSHealthUpdateUsageDescription = updateUsage;
    // Write-only app. A share description would advertise a read it never makes.
    delete c.modResults.NSHealthShareUsageDescription;
    return c;
  });
  return config;
};
