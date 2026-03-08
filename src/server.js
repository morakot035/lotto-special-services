import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import buyerRoutes from "./routes/buyer.routes.js";
import orderRoutes from "./routes/order.routes.js";
import ruleRoutes from "./routes/rule.routes.js";
import keepSettingRoutes from "./routes/keepSetting.routes.js";
import reportRoutes from "./routes/report.routes.js";
import kickRuleRoutes from "./routes/kickRule.routes.js";
import buyerSummaryRoutes from "./routes/buyerSummary.routes.js";

config();
connectDB();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://lotto-special-app.vercel.app",
      "https://lotto-special-services.onrender.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.options(/.*/, cors());
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);
app.use((req, res, next) => {
  console.log(`📥 Request: ${req.method} ${req.url}`);
  next();
});
app.use("/api/auth", authRoutes);
app.use("/api/buyers", buyerRoutes);
app.use("/api", orderRoutes);
app.use("/api", ruleRoutes);
app.use("/api/keep-settings", keepSettingRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/kick-rules", kickRuleRoutes);
app.use("/api/buyer-summary", buyerSummaryRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
