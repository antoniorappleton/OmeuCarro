const admin = require("firebase-admin");
const { sendNotificationToUser } = require("./notify_utils");

// Force a project ID to avoid environment issues in local testing
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "omeucarro-d3889"
  });
}

(async () => {
  try {
    const db = admin.firestore();
    // Use the first user found in the DB for the test
    const usersSnap = await db.collection("users").limit(1).get();
    
    if (usersSnap.empty) {
      console.log("No users found to test.");
      process.exit(0);
    }
    
    const userId = usersSnap.docs[0].id;
    console.log(`Testing notifications for user: ${userId}`);
    
    await sendNotificationToUser(
      userId,
      "🧪 Teste L100",
      "As notificações automáticas estão prontas! ✅",
      { url: "/veiculos.html" }
    );
    
    console.log("Notification test triggered successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error during notification test:", err);
    process.exit(1);
  }
})();
