<?php

$require_https = true; // DO NOT change this line in production and keep it 'true', set to 'false' only temporarily for local development without SSL

// 1. HTTPS ENFORCEMENT (Security Best Practice)
// If the connection is not secure, reject immediately to protect plain text password.
$isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $_SERVER['SERVER_PORT'] == 443;

if ($require_https && !$isSecure) {
    http_response_code(403);
    die(jsonState("error", "ssl_required", "HTTPS is required for updates"));
}

// 2. CHECK PING (Health Check)
if (isset($_GET["ping"])){
    echo jsonState("online", "", "");
    exit;
}

// 3. GLOBAL RATE LIMITING (No IP Tracking)
$lockFile = "./usercontent/identity/login_lock.json";
$limitWindow = 600; // 10 minutes
$maxAttempts = 5;   // Allow 5 failures per 10 mins globally

$lockData = ["timestamp" => 0, "failures" => 0];

if (file_exists($lockFile)) {
    $json = json_decode(file_get_contents($lockFile), true);
    if ($json) {
        $lockData = $json;
    }
}

// Prune old locks if time window passed
if (time() - $lockData["timestamp"] > $limitWindow) {
    $lockData["failures"] = 0;
    $lockData["timestamp"] = time(); // Reset window start
}

// Check if blocked
if ($lockData["failures"] >= $maxAttempts) {
    http_response_code(429); // Too Many Requests
    die(jsonState("error", "rate_limit_exceeded", "Too many failed attempts. System locked for 10 minutes."));
}


// 4. LOAD CREDENTIALS
$credentials_file = "./usercontent/identity/credentials.php";

if (!file_exists($credentials_file)) {
    die(jsonState("error", "upload_disabled", "Upload disabled (File missing)"));
}

include $credentials_file;

// Ensure variables exist and are not empty
if (empty($username) || empty($password)) {
    die(jsonState("error", "upload_disabled", "Upload disabled by administrator"));
}

if (!isset($_POST["username"]) || !isset($_POST["password"])) {
    die(jsonState("error", "no_credentials_received", "No credentials received"));
}

// 5. VALIDATE CREDENTIALS (Timing Attack Safe)
// We use hash_equals to compare strings in constant time, even though they are plain text.
// This prevents attackers from guessing the password letter-by-letter based on response time.

$userValid = hash_equals($username, $_POST["username"]);
$passValid = hash_equals($password, $_POST["password"]);

if ($userValid && $passValid) {
    // --- SUCCESS ---
    
    // Reset the failure counter on success
    file_put_contents($lockFile, json_encode(["timestamp" => time(), "failures" => 0]));

    try {
        $checklistDirectory = "./usercontent/data/";
        if (!is_dir($checklistDirectory)) {
            mkdir($checklistDirectory);
        }

        // Direct write (No JSON validation as requested)
        file_put_contents($checklistDirectory . "checklist.json", $_POST["checklist_data"]);
        echo jsonState("success", "", "");
        exit;

    } catch (Exception $ex) {
        echo jsonState("error", "other_upload_error", $ex->getMessage());
        exit;
    }

} else {
    // --- FAILURE ---

    // Increment global failure count
    $lockData["failures"]++;
    // Update timestamp only if this is the first failure in a while
    if ($lockData["failures"] == 1) {
        $lockData["timestamp"] = time();
    }
    
    file_put_contents($lockFile, json_encode($lockData));

    // Optional: Add a small random delay (fake lag) to annoy automated scripts
    // usleep(rand(100000, 300000)); 

    echo jsonState("error", "auth_failed", "Authentication failed");
    exit;
}

// Helper Function
function jsonState($state, $messageCode, $fallbackMessage)
{
    // Return JSON
    return json_encode([
        "state" => $state,
        "messageCode" => $messageCode,
        "details" => $fallbackMessage
    ]);
}
?>