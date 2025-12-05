async function addDocument(col, data) {
  return db.collection(col).add(data);
}

async function getUserDocuments(col) {
  return db.collection(col)
           .where("userId", "==", auth.currentUser.uid)
           .get();
}
