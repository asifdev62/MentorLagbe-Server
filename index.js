
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import Stripe from "stripe";
import { timingSafeEqual } from "node:crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URL);

await client.connect();

console.log("You successfully connected to MongoDB!");

const database = client.db("mentorlagbe");

const users = database.collection("user");
const tuitions = database.collection("tuitions");
const applications = database.collection("applications");
const payments = database.collection("payments");
const bookmarkCollection = database.collection("bookmarks");

// Create indexes
try {
  await applications.createIndex(
    { tuitionId: 1, studentEmail: 1 },
    { unique: true }
  );

  await bookmarkCollection.createIndex(
    { tuitionId: 1, studentEmail: 1 },
    { unique: true }
  );
} catch (error) {
  console.error("Database index creation warning:", error.message);
}

// Admin API Secret
const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET;

// Verify Admin / Internal API Request
const verifyAdminApi = (req, res, next) => {
  const receivedSecret = req.headers["x-admin-api-secret"];

  if (!ADMIN_API_SECRET || typeof receivedSecret !== "string") {
    return res.status(401).send({
      success: false,
      message: "Unauthorized access",
    });
  }

  const received = Buffer.from(receivedSecret);
  const expected = Buffer.from(ADMIN_API_SECRET);

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return res.status(401).send({
      success: false,
      message: "Invalid API credentials",
    });
  }

  next();
};

// Escape user input before building a case-insensitive RegExp
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildEmailRegex = (email) =>
  new RegExp(`^${escapeRegex(email)}$`, "i");

// Home API
app.get("/", (req, res) => {
  res.send("Mentorlagbe is running");
});

// Get All Users
app.get("/users", async (req, res) => {
  const result = await users.find().toArray();
  res.send(result);
});

// ADMIN USER MANAGEMENT APIs

// Get All Registered Users
app.get("/admin/users", verifyAdminApi, async (req, res) => {
  try {
    const result = await users
      .find(
        {},
        {
          projection: {
            name: 1,
            email: 1,
            image: 1,
            role: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ _id: -1 })
      .toArray();

    const formattedUsers = result.map((user) => ({
      ...user,
      _id: user._id.toString(),
      role: user.role || "student",
    }));

    res.status(200).send({
      success: true,
      users: formattedUsers,
    });
  } catch (error) {
    console.error("Admin users fetch error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch users",
    });
  }
});

// Update User Role
app.patch("/admin/users/:id/role", verifyAdminApi, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const allowedRoles = ["student", "tutor", "admin"];

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).send({
        success: false,
        message: "Invalid role",
      });
    }

    const existingUser = await users.findOne({
      _id: new ObjectId(id),
    });

    if (!existingUser) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    const result = await users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { role },
      }
    );

    res.status(200).send({
      success: true,
      message:
        result.modifiedCount > 0
          ? "User role updated successfully"
          : "Role is already up to date",
      role,
    });
  } catch (error) {
    console.error("Admin role update error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to update user role",
    });
  }
});

// TUITION RELATED APIs

// Post Tuition
app.post("/tuitions", async (req, res) => {
  try {
    const tuition = req.body;

    const result = await tuitions.insertOne(tuition);

    res.send(result);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to create tuition",
    });
  }
});

// Get All Approved Tuitions
// Keep this route before /tuitions/:id
app.get("/tuitions/approved", async (req, res) => {
  try {
    const result = await tuitions
      .find({ approvalStatus: "approved" })
      .sort({ _id: -1 })
      .toArray();

    res.send({
      success: true,
      tuitions: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to fetch approved tuitions",
    });
  }
});

// Get All Tuitions (optionally filter by user, tutor email or approval status)
app.get("/tuitions", async (req, res) => {
  try {
    const { userId, tutorEmail, approvalStatus } = req.query;

    const query = {};

    if (userId) {
      query.userId = userId;
    }

    if (tutorEmail) {
      query.tutorEmail = tutorEmail;
    }

    if (approvalStatus) {
      query.approvalStatus = approvalStatus;
    }

    const result = await tuitions
      .find(query)
      .sort({ _id: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch tuitions",
    });
  }
});

// Get Single Tuition
app.get("/tuitions/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    const result = await tuitions.findOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch tuition",
    });
  }
});

// Get Single Approved Tuition
app.get("/approved-tuitions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    const result = await tuitions.findOne({
      _id: new ObjectId(id),
      approvalStatus: "approved",
    });

    if (!result) {
      return res.status(404).send({
        success: false,
        message: "Approved tuition not found",
      });
    }

    res.send({
      success: true,
      tuition: result,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch tuition details",
    });
  }
});

// Update Tuition
app.put("/tuitions/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid tuition ID",
      });
    }

    const updatedData = req.body;

    const result = await tuitions.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update tuition",
    });
  }
});

// Update Tuition Status
app.patch("/tuitions/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { approvalStatus } = req.body;

    const result = await tuitions.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          approvalStatus,
        },
      }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update tuition status",
    });
  }
});

// Delete Tuition
app.delete("/tuitions/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await tuitions.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete tuition",
    });
  }
});

// APPLICATION RELATED APIs

// Post Application
app.post("/applications", verifyAdminApi, async (req, res) => {
  try {
    const {
      tuitionId,
      studentEmail,
      phone,
      education,
      institution,
      message,
    } = req.body;

    if (!ObjectId.isValid(tuitionId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    if (!studentEmail) {
      return res.status(400).send({
        success: false,
        message: "Student email is required",
      });
    }

    const student = await users.findOne({
      email: buildEmailRegex(studentEmail.trim()),
      role: "student",
    });

    if (!student) {
      return res.status(403).send({
        success: false,
        message: "Only registered students can apply",
      });
    }

    const tuition = await tuitions.findOne({
      _id: new ObjectId(tuitionId),
      approvalStatus: "approved",
    });

    if (!tuition) {
      return res.status(404).send({
        success: false,
        message: "Approved tuition not found",
      });
    }

    const normalizedStudentEmail = student.email;

    const existingApplication = await applications.findOne({
      tuitionId: new ObjectId(tuitionId),
      studentEmail: normalizedStudentEmail,
    });

    if (existingApplication) {
      return res.status(409).send({
        success: false,
        message: "You have already applied for this tuition",
      });
    }

    const application = {
      tuitionId: new ObjectId(tuitionId),
      tutorEmail: tuition.tutorEmail,
      tutorId: tuition.userId || null,
      studentEmail: normalizedStudentEmail,
      userId: student._id.toString(),
      studentName: student.name || "",
      phone: phone || "",
      education: education || "",
      institution: institution || "",
      message: message || "",
      status: "pending",
      appliedAt: new Date(),
    };

    const result = await applications.insertOne(application);

    res.status(201).send({
      success: true,
      message: "Application submitted successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).send({
        success: false,
        message: "You have already applied for this tuition",
      });
    }

    console.error("Application submission error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to submit application",
    });
  }
});

// Get All Applications (Filter by User ID)
app.get("/applications", async (req, res) => {
  try {
    const userId = req.query.userId;

    const query = userId ? { userId: userId } : {};

    const result = await applications.find(query).toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch applications",
    });
  }
});

// Application Count
app.get("/applications/count", async (req, res) => {
  try {
    const applicantId = req.query.applicantId;

    const count = await applications.countDocuments({
      userId: applicantId,
    });

    res.send({ count });
  } catch (error) {
    res.status(500).send({
      message: "Failed to get application count",
    });
  }
});

// Get Applicants by Tutor Email
app.get("/applications/tutor/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || "").trim();

    if (!email) {
      return res.send([]);
    }

    const emailRegex = buildEmailRegex(email);

    const tutor = await users.findOne({ email: emailRegex });

    const tuitionFilters = [{ tutorEmail: emailRegex }];

    if (tutor) {
      tuitionFilters.push({ userId: tutor._id.toString() });
      tuitionFilters.push({ userId: tutor._id });
    }

    const tutorTuitions = await tuitions
      .find(
        { $or: tuitionFilters },
        { projection: { _id: 1 } }
      )
      .toArray();

    const tuitionIds = tutorTuitions.map((item) => item._id.toString());

    const result = await applications
      .find({
        $or: [
          { tutorEmail: emailRegex },
          { tuitionId: { $in: tuitionIds } },
        ],
      })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch applicants",
    });
  }
});

// Get Single Application
app.get("/applications/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid application ID",
      });
    }

    const result = await applications.findOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch application",
    });
  }
});

// Delete Pending Application
app.delete("/applications/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.query.userId;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid application ID",
      });
    }

    const result = await applications.deleteOne({
      _id: new ObjectId(id),
      userId: userId,
      status: { $in: ["pending", "Pending"] },
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete application",
    });
  }
});

// Update application status (Pending / Accepted / Rejected)
app.patch("/applications/:id/status", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body || {};

  const allowedStatuses = ["Pending", "Accepted", "Rejected"];

  const normalizedStatus =
    typeof status === "string" && status.trim()
      ? status.trim().charAt(0).toUpperCase() +
        status.trim().slice(1).toLowerCase()
      : "";

  if (!allowedStatuses.includes(normalizedStatus)) {
    return res.status(400).send({
      message: "Invalid application status",
    });
  }

  try {
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid application ID",
      });
    }

    const result = await applications.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: normalizedStatus,
        },
      }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update application status",
    });
  }
});

// BOOKMARK RELATED APIs

// Add Bookmark
app.post("/bookmarks", verifyAdminApi, async (req, res) => {
  try {
    const { tuitionId, studentEmail } = req.body;

    if (!ObjectId.isValid(tuitionId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    if (!studentEmail) {
      return res.status(400).send({
        success: false,
        message: "Student email is required",
      });
    }

    const student = await users.findOne({
      email: buildEmailRegex(studentEmail.trim()),
      role: "student",
    });

    if (!student) {
      return res.status(403).send({
        success: false,
        message: "Student not found",
      });
    }

    const tuition = await tuitions.findOne({
      _id: new ObjectId(tuitionId),
      approvalStatus: "approved",
    });

    if (!tuition) {
      return res.status(404).send({
        success: false,
        message: "Approved tuition not found",
      });
    }

    const normalizedStudentEmail = student.email;

    const existingBookmark = await bookmarkCollection.findOne({
      studentEmail: normalizedStudentEmail,
      tuitionId: new ObjectId(tuitionId),
    });

    if (existingBookmark) {
      return res.status(409).send({
        success: false,
        message: "Tuition already bookmarked",
      });
    }

    const bookmarkCount = await bookmarkCollection.countDocuments({
      studentEmail: normalizedStudentEmail,
    });

    // Existing Stripe payment system:
    // Student Pro = premium: true + premiumPlan: "student"
    const isPro =
      student.premium === true &&
      student.premiumPlan === "student";

    // Support optional subscription field if used in future
    const hasProSubscription =
      student.subscription === "pro";

    if (!isPro && !hasProSubscription && bookmarkCount >= 5) {
      return res.status(403).send({
        success: false,
        message: "Free students can bookmark only 5 tuitions. Upgrade to Pro.",
        limit: 5,
        currentCount: bookmarkCount,
      });
    }

    const result = await bookmarkCollection.insertOne({
      studentEmail: normalizedStudentEmail,
      userId: student._id.toString(),
      tuitionId: new ObjectId(tuitionId),
      createdAt: new Date(),
    });

    res.status(201).send({
      success: true,
      message: "Tuition bookmarked successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).send({
        success: false,
        message: "Tuition already bookmarked",
      });
    }

    console.error("Bookmark error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to bookmark tuition",
    });
  }
});

// Get Student Bookmarks
app.get("/bookmarks", verifyAdminApi, async (req, res) => {
  try {
    const { studentEmail } = req.query;

    if (!studentEmail || typeof studentEmail !== "string") {
      return res.status(400).send({
        success: false,
        message: "Student email is required",
      });
    }

    const student = await users.findOne({
      email: buildEmailRegex(studentEmail.trim()),
      role: "student",
    });

    if (!student) {
      return res.status(404).send({
        success: false,
        message: "Student not found",
      });
    }

    const bookmarks = await bookmarkCollection
      .aggregate([
        {
          $match: {
            studentEmail: student.email,
          },
        },
        {
          $lookup: {
            from: "tuitions",
            localField: "tuitionId",
            foreignField: "_id",
            as: "tuition",
          },
        },
        {
          $unwind: {
            path: "$tuition",
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
      ])
      .toArray();

    res.send({
      success: true,
      bookmarks,
      count: bookmarks.length,
      isPro:
        student.premium === true &&
        student.premiumPlan === "student",
      limit:
        student.premium === true &&
        student.premiumPlan === "student"
          ? null
          : 5,
    });
  } catch (error) {
    console.error("Get bookmarks error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch bookmarks",
    });
  }
});

// Remove Bookmark
app.delete("/bookmarks/:tuitionId", verifyAdminApi, async (req, res) => {
  try {
    const { tuitionId } = req.params;
    const { studentEmail } = req.body;

    if (!ObjectId.isValid(tuitionId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    if (!studentEmail) {
      return res.status(400).send({
        success: false,
        message: "Student email is required",
      });
    }

    const student = await users.findOne({
      email: buildEmailRegex(studentEmail.trim()),
      role: "student",
    });

    if (!student) {
      return res.status(404).send({
        success: false,
        message: "Student not found",
      });
    }

    const result = await bookmarkCollection.deleteOne({
      studentEmail: student.email,
      tuitionId: new ObjectId(tuitionId),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Bookmark not found",
      });
    }

    res.send({
      success: true,
      message: "Bookmark removed successfully",
    });
  } catch (error) {
    console.error("Remove bookmark error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to remove bookmark",
    });
  }
});

// Find Single User by ID
app.get("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await users.findOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to find user",
    });
  }
});

// Update User Profile
app.patch("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await users.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: req.body,
      }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update user profile",
    });
  }
});

// PAYMENT RELATED APIs

app.post("/payment/checkout-verify", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).send({
      success: false,
      message: "Session ID is required",
    });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product"],
    });

    const {
      status,
      payment_status,
      customer_details,
      customer_email,
      metadata,
      payment_intent,
      amount_total,
      currency,
      mode,
    } = session;

    if (status !== "complete" || payment_status !== "paid") {
      return res.send({
        success: false,
        message: "Payment verification failed",
      });
    }

    // Idempotent: refreshing the success page must not create duplicates.
    const existingPayment = await payments.findOne({ sessionId });

    if (existingPayment) {
      return res.send({
        success: true,
        alreadyVerified: true,
        message: "Payment already verified",
      });
    }

    const plan = metadata?.plan === "tutor" ? "tutor" : "student";

    const product = session.line_items?.data?.[0]?.price?.product;

    const planName =
      product && typeof product === "object" && product.name
        ? product.name
        : plan === "tutor"
          ? "Tutor Pro"
          : "Student Premium";

    const payment = {
      sessionId,
      status,
      payment_status,
      customer_name: customer_details?.name || null,
      customer_email: customer_details?.email || customer_email || null,
      userid: metadata?.userId || null,
      plan,
      plan_name: planName,
      amount_total: amount_total ?? null,
      currency: currency || null,
      mode: mode || null,
      payment_intent:
        typeof payment_intent === "string"
          ? payment_intent
          : payment_intent?.id || null,
      payment_date: new Date(),
    };

    const result = await payments.insertOne(payment);

    let updateResult = null;

    if (metadata?.userId && ObjectId.isValid(metadata.userId)) {
      updateResult = await users.updateOne(
        { _id: new ObjectId(metadata.userId) },
        {
          $set: {
            premium: true,
            premiumPlan: plan,
            premiumSince: new Date(),
          },
        }
      );
    }

    res.send({ success: true, result, updateResult });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message || "Payment verification failed",
    });
  }
});

// Get all payment records for the admin dashboard.
app.get("/payments", async (req, res) => {
  try {
    const records = await payments
      .find()
      .sort({ payment_date: -1, createdAt: -1 })
      .toArray();

    const userIds = [
      ...new Set(
        records
          .map((payment) => payment.userid || payment.userId)
          .filter(Boolean)
          .map(String)
      ),
    ];

    const objectIds = userIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const userDocs = objectIds.length
      ? await users.find({ _id: { $in: objectIds } }).toArray()
      : [];

    const userMap = new Map(
      userDocs.map((user) => [user._id.toString(), user])
    );

    const result = records.map((payment) => {
      const userId = String(payment.userid || payment.userId || "");
      const user = userMap.get(userId);
      const plan = payment.plan || "student";

      return {
        _id: payment._id,
        sessionId: payment.sessionId || payment.stripeSessionId || null,
        userId,
        userName: user?.name || payment.customer_name || "Unknown user",
        email:
          user?.email || payment.customer_email || payment.email || null,
        role: user?.role || "student",
        plan,
        planName:
          payment.plan_name ||
          (plan === "tutor" ? "Tutor Pro" : "Student Premium"),
        amount: payment.amount_total ?? payment.amountTotal ?? null,
        currency: payment.currency || null,
        status: payment.payment_status || payment.status || null,
        transactionId:
          payment.payment_intent ||
          payment.paymentIntentId ||
          payment.sessionId ||
          payment.stripeSessionId ||
          null,
        paymentDate:
          payment.payment_date ||
          payment.createdAt ||
          payment.updatedAt ||
          null,
      };
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message || "Failed to load payments",
    });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Mentorlagbe is running on port ${port}`);
});