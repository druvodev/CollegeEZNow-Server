require("dotenv").config();
const express = require("express");
const cors = require("cors");
// const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// -------------------------------------------------

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.18ceobk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const database = client.db("CollegeEZNow");
    const collegeCollection = database.collection("colleges");
    const studentCollection = database.collection("students");

    app.get("/all", async (req, res) => {
      const result = await collegeCollection.find().toArray();
      res.json(result);
    });
    // Get all colleges with the average rating as 5
    app.get("/colleges", async (req, res) => {
      try {
        const aggregationPipeline = [
          {
            $project: {
              _id: 0,
              collegeName: 1,
              collegeImage: 1,
              admissionDate: 1,
              researchCount: 1,
              averageRating: {
                $cond: {
                  if: { $eq: [{ $size: "$reviews" }, 0] }, // Check if totalReviews is 0 to avoid division by zero
                  then: 0,
                  else: { $avg: "$reviews.rating" }, // Calculate the average rating for each college
                },
              },
            },
          },
        ];

        const collegesWithRating = await collegeCollection
          .aggregate(aggregationPipeline)
          .toArray();

        res.json(collegesWithRating);
      } catch (error) {
        console.error(
          "Error fetching colleges with the average rating:",
          error
        );
        res
          .status(500)
          .json({ error: "An error occurred while fetching colleges." });
      }
    });

    // Route: Get top 3 colleges based on average rating and total reviews
    app.get("/topCollege", async (req, res) => {
      try {
        const aggregationPipeline = [
          {
            $unwind: "$reviews", // Unwind the "reviews" array
          },
          {
            $group: {
              _id: "$_id",
              collegeName: { $first: "$collegeName" },
              collegeImage: { $first: "$collegeImage" },
              admissionDate: { $first: "$admissionDate" },
              totalRatings: {
                $sum: "$reviews.rating", // Calculate the sum of all reviews' ratings
              },
              totalReviews: {
                $sum: 1, // Calculate the total number of reviews for each college
              },
              events: { $first: "$events" }, // Preserve the "events" field for each college
              researchPapers: { $first: "$researchPapers" }, // Preserve the "researchPapers" field for each college
              sportsFacilities: { $first: "$sportsFacilities" }, // Preserve the "sportsFacilities" field for each college
            },
          },
          {
            $addFields: {
              collegeAvgRating: {
                $divide: ["$totalRatings", "$totalReviews"], // Calculate the average rating for each college
              },
            },
          },
          {
            $sort: {
              collegeAvgRating: -1, // Sort colleges in descending order of average rating
              totalReviews: -1, // If two colleges have the same average rating, sort them based on total reviews
            },
          },
          {
            $project: {
              _id: 1,
              collegeName: 1,
              collegeImage: 1,
              admissionDate: 1,
              collegeAvgRating: 1,
              events: 1,
              researchPapers: 1,
              sportsFacilities: 1,
            },
          },
          {
            $limit: 3, // Get only the top 3 colleges
          },
        ];

        const topColleges = await collegeCollection
          .aggregate(aggregationPipeline)
          .toArray();

        // Send the response containing top 3 colleges based on average rating
        res.json(topColleges);
      } catch (error) {
        console.error("Error fetching top colleges:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching top colleges." });
      }
    });

    // Route: Get reviews and other data for each college
    app.get("/reviews", async (req, res) => {
      try {
        // Perform aggregation to get reviews and other data for each college
        const aggregationPipeline = [
          {
            $unwind: "$reviews", // Unwind the "reviews" array
          },
          {
            $group: {
              _id: "$_id",
              collegeName: { $first: "$collegeName" },
              logo: { $first: "$logo" },
              collegeRating: { $avg: "$reviews.rating" }, // Calculate the average rating for each college
              events: { $first: "$events" }, // Preserve the "events" field for each college
              reviews: { $push: "$reviews" }, // Preserve the "reviews" array for each college
            },
          },
          {
            $project: {
              collegeName: 1,
              logo: 1,
              collegeRating: 1, // Include the collegeRating field (average of ratings)
              events: 1,
              reviews: 1,
            },
          },
        ];

        const collegesWithReviews = await collegeCollection
          .aggregate(aggregationPipeline)
          .toArray();

        // Send the response containing reviews and other data for each college
        res.json(collegesWithReviews);
      } catch (error) {
        console.error("Error fetching reviews and data for colleges:", error);
        res.status(500).json({
          error: "An error occurred while fetching reviews and data.",
        });
      }
    });

    // Route: Get research papers and other data for each college
    app.get("/researchPapers", async (req, res) => {
      try {
        // Perform aggregation to get research papers and other data for each college
        const aggregationPipeline = [
          {
            $project: {
              collegeName: 1,
              researchPapers: 1,
            },
          },
        ];

        const collegesWithResearchPapers = await collegeCollection
          .aggregate(aggregationPipeline)
          .toArray();

        // Send the response containing research papers and other data for each college
        res.json(collegesWithResearchPapers);
      } catch (error) {
        console.error(
          "Error fetching research papers and data for colleges:",
          error
        );
        res.status(500).json({
          error: "An error occurred while fetching research papers and data.",
        });
      }
    });

    // Route: Get student data by email
    app.get("/students/:email", async (req, res) => {
      const email = req.params.email;

      try {
        const student = await studentCollection.findOne({ email });

        if (!student) {
          return res.status(404).json({ error: "Student not found." });
        }

        // Fetch the associated college data for the student from the college collection
        const college = await collegeCollection.findOne({
          collegeName: student.college,
        });

        // Combine the student and college data into a single object
        const studentWithCollegeData = { ...student, logo: college?.logo };

        res.json(studentWithCollegeData);
      } catch (error) {
        console.error("Error fetching student data:", error);
        res
          .status(500)
          .json({ error: "An error occurred while fetching student data." });
      }
    });

    // Route: Search colleges by name
    app.get("/search", async (req, res) => {
      const searchTerm = req.query.name;
      const regex = new RegExp(searchTerm, "i"); // Case-insensitive search
      const result = await collegeCollection
        .find({ collegeName: regex })
        .toArray();

      res.json(result);
    });

    // Route: Search Result Modal by _id
    app.get("/college/:collegeId", async (req, res) => {
      const collegeId = req.params.collegeId;
      try {
        const college = await collegeCollection
          .aggregate([
            { $match: { _id: new ObjectId(collegeId) } },
            {
              $project: {
                _id: 0,
                collegeName: 1,
                collegeImage: 1,
                admissionDate: 1,
                researchCount: 1,
                averageRating: {
                  $cond: {
                    if: { $eq: [{ $size: "$reviews" }, 0] },
                    then: 0,
                    else: { $avg: "$reviews.rating" },
                  },
                },
              },
            },
          ])
          .toArray();

        if (college.length === 0) {
          // College not found
          return res.status(404).json({ message: "College not found" });
        }

        res.json(college[0]); // Return the first matching college (assuming collegeId is unique)
      } catch (error) {
        console.error("Error fetching college data:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Add New Student
    app.post("/updateUser", async (req, res) => {
      const item = req.body;

      // Check if the student with the given email already exists in the database
      const existingStudent = await studentCollection.findOne({
        email: item.email,
      });

      if (existingStudent) {
        return res
          .status(409)
          .json({ error: "Student with this email already exists." });
      }

      // If the student doesn't exist, proceed with adding the new student
      item.createdAt = new Date();
      const result = await studentCollection.insertOne(item);
      res.json(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

// --------------------------------------------------------------

// Respond with a message for the root route
app.get("/", (req, res) => {
  res.send("CollegeEZNow is running");
});

// Start the server
app.listen(port, () => {
  console.log(`CollegeEZNow Server is running on port ${port}`);
});
