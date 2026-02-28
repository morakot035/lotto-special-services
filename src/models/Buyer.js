import mongoose from "mongoose";

const buyerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: false },
});

export default mongoose.model("Buyers", buyerSchema);
