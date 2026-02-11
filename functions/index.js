/**
 * Cloud Functions for OmeuCarro
 */
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

// Exportar funções principais
// Usamos require direto na atribuição para permitir o carregamento sob demanda
exports.uploadTorqueData = require("./torque").uploadTorqueData;
exports.importFuelData = require("./import_fuel").importFuelData;
exports.importTorqueCsv = require("./import_torque_csv").importTorqueCsv;
exports.processOBDReading = require("./tripDetector").processOBDReading;

// Alertas agendados (movidos para ficheiro próprio para limpeza)
exports.checkVehicleAlertsV2 = require("./alerts").checkVehicleAlertsV2;
