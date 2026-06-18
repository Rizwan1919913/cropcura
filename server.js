// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./supabaseClient');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Explicitly serve frontend home view to handle static routing securely
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * REST Endpoint: Underwriting pipeline replicating multi-table SQL join constraints
 */
app.get('/api/v1/underwriting/search', async (req, res) => {
    try {
        const { name } = req.query;

        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, error: "Search query parameter 'name' is required." });
        }

        console.log(`[Underwriting Request] Executing relational sync layer for keyword: ${name}`);

        // Step 1: Query users matching search parameter string
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, name, email')
            .ilike('name', `%${name}%`)
            .limit(30);

        if (userError) throw userError;
        if (!users || users.length === 0) return res.status(200).json([]);

        const aggregatedProfiles = [];

        // Step 2: Loop and execute relational table alignments (Mimicking SQL JOIN constraints)
        for (const user of users) {
            
            // JOIN public."farm_profiles" fp ON fp."user_id" = u."id"
            const { data: farms, error: farmErr } = await supabase
                .from('farm_profiles')
                .select('*')
                .eq('user_id', user.id);

            // STRICT CONSTRAINT: If user has no farm records, skip completely
            if (farmErr || !farms || farms.length === 0) {
                continue; 
            }

            // JOIN public."loan_applications" la ON la."user_id" = u."id"
            const { data: loans } = await supabase
                .from('loan_applications')
                .select('*')
                .eq('user_id', user.id);

            // JOIN public."credit_scoring_results" csr ON csr."user_id" = u."id" ORDER BY csr."computed_at" DESC
            const { data: creditScores } = await supabase
                .from('credit_scoring_results')
                .select('*')
                .eq('user_id', user.id)
                .order('computed_at', { ascending: false });

            let latestLoan = (loans && loans.length > 0) ? loans[0] : null;
            let latestScoreRecord = (creditScores && creditScores.length > 0) ? creditScores[0] : null;

            // Extract nested paths: (csr.scoring_json->'summary'->>'total')::numeric & ->>'band'
            let creditScoreTotal = 'N/A';
            let creditBand = 'NONE';

            if (latestScoreRecord && latestScoreRecord.scoring_json) {
                const scoringJson = typeof latestScoreRecord.scoring_json === 'string'
                    ? JSON.parse(latestScoreRecord.scoring_json)
                    : latestScoreRecord.scoring_json;
                
                if (scoringJson.summary) {
                    creditScoreTotal = scoringJson.summary.total || 'N/A';
                    creditBand = scoringJson.summary.band || 'NONE';
                }
            }

            const resolvedAmount = latestLoan ? (latestLoan.loan_amount || latestLoan.amount || 0) : 0;
            const resolvedStatus = latestLoan ? (latestLoan.status || 'PENDING') : 'NONE';
            const resolvedLoanId = latestLoan ? latestLoan.id : 'NO_ACTIVE_APPLICATION';

            aggregatedProfiles.push({
                userId: user.id,
                fullName: user.name || "Unnamed Farmer",
                email: user.email || "N/A",
                loanId: String(resolvedLoanId),
                loanAmount: `$${parseFloat(resolvedAmount).toLocaleString()}`,
                creditScore: creditScoreTotal,
                creditBand: String(creditBand).toUpperCase(),
                loanStatus: String(resolvedStatus).toUpperCase(),
                farmData: farms[0].farm_profile_json || {} // Holds full fields schema array
            });
        }

        return res.status(200).json(aggregatedProfiles);

    } catch (err) {
        console.error(`[Underwriting Pipeline Critical Exception]: ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 CropCura Relational Credit & Farm Matcher Online`);
    console.log(`📡 Gateway Hub Target: http://localhost:${PORT}/`);
    console.log(`=======================================================`);
});