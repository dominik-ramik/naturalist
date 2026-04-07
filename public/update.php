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
if (isset($_GET["ping"])) {
    echo jsonState("online", "", "");
    exit;
}

// 2b. PROXY FETCH (CORS workaround for same-host clients only)
if (isset($_GET["proxy"])) {
    // Derive the requester's origin/host and reject anything not from our own host.
    // HTTP_ORIGIN is set by browsers on cross-origin requests; HTTP_REFERER is the fallback.
    $requestHost = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (empty($requestHost)) {
        $requestHost = parse_url($_SERVER['HTTP_REFERER'] ?? '', PHP_URL_SCHEME) . '://'
            . parse_url($_SERVER['HTTP_REFERER'] ?? '', PHP_URL_HOST);
    }
    if (empty($requestHost) || strpos($requestHost, $_SERVER['HTTP_HOST']) === false) {
        http_response_code(403);
        die(jsonState("error", "proxy_forbidden", "Proxy access is restricted to same-host requests"));
    }

    $url = $_POST['url'] ?? '';
    if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i', $url)) {
        http_response_code(400);
        die(jsonState("error", "proxy_invalid_url", "A valid HTTP or HTTPS URL is required"));
    }

    $context = stream_context_create(['http' => [
        'timeout'         => 15,
        'follow_location' => true,
        'max_redirects'   => 3,
    ]]);

    $data = @file_get_contents($url, false, $context);
    if ($data === false) {
        http_response_code(502);
        die(jsonState("error", "proxy_fetch_failed", "Failed to fetch the remote URL"));
    }

    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . strlen($data));
    echo $data;
    exit;
}

// 3. GLOBAL RATE LIMITING (No IP Tracking for failures)
$lockFile = "./usercontent/identity/login_lock.json";
$limitWindow = 600; // 10 minutes
$maxAttempts = 5;   // Allow 5 failures per 10 mins globally

$lockData = ["timestamp" => 0, "failures" => 0, "update_log" => []];

if (file_exists($lockFile)) {
    $json = json_decode(file_get_contents($lockFile), true);
    if ($json) {
        $lockData = array_merge($lockData, $json);
    }
}

// Ensure update_log key exists (migration from old format)
if (!isset($lockData["update_log"]) || !is_array($lockData["update_log"])) {
    $lockData["update_log"] = [];
}

// Prune old locks if time window passed
if (time() - $lockData["timestamp"] > $limitWindow) {
    $lockData["failures"] = 0;
    $lockData["timestamp"] = time();
}

// Check if blocked
if ($lockData["failures"] >= $maxAttempts) {
    http_response_code(429);
    die(jsonState("error", "rate_limit_exceeded", "Too many failed attempts. System locked for 10 minutes."));
}

// 4. LOAD CREDENTIALS
$credentials_file = "./usercontent/identity/credentials.php";

if (!file_exists($credentials_file)) {
    die(jsonState("error", "upload_disabled", "Upload disabled (File missing)"));
}

include $credentials_file;

// --- Backward compatibility: convert old single $username/$password to $credentials array ---
if (!isset($credentials) || !is_array($credentials)) {
    $credentials = [];
    if (isset($username) && isset($password) && $username !== "" && $password !== "") {
        $credentials[] = ["username" => $username, "password" => $password];
    }
}

// Check if any credentials are configured
if (empty($credentials)) {
    die(jsonState("error", "upload_disabled", "Upload disabled by administrator"));
}

if (!isset($_POST["username"]) || !isset($_POST["password"])) {
    die(jsonState("error", "no_credentials_received", "No credentials received"));
}

// Prevent fatal errors if credentials.php is formatted as a flat array instead of an array of arrays
foreach ($credentials as $cred) {
    if (!is_array($cred) || !isset($cred["username"]) || !isset($cred["password"])) {
        http_response_code(500); // 500 Internal Server Error (since it's a server config issue)
        die(jsonState("error", "config_format_error", "Server misconfiguration: credentials.php is improperly formatted. It must be an array of arrays."));
    }
}

// 5. VALIDATE CREDENTIALS (Timing Attack Safe)
// We check every credential pair to avoid timing leaks that reveal which pairs exist.
$matchedUser = null;

foreach ($credentials as $cred) {
    $userValid = hash_equals($cred["username"], $_POST["username"]);
    $passValid = hash_equals($cred["password"], $_POST["password"]);

    if ($userValid && $passValid) {
        $matchedUser = $cred["username"];
        // Do NOT break early to maintain constant-time behavior across all pairs
    }
}

if ($matchedUser !== null) {
    // --- SUCCESS ---

    // Reset the failure counter on success
    $lockData["failures"] = 0;
    $lockData["timestamp"] = time();

    // Record this successful update in the log (last 20 entries)
    $logEntry = [
        "username" => $matchedUser,
        "date"     => date("Y-m-d H:i:s"),
        "ip"       => $_SERVER["REMOTE_ADDR"] ?? "unknown",
    ];

    $lockData["update_log"][] = $logEntry;

    // Keep only the last 20 entries
    if (count($lockData["update_log"]) > 20) {
        $lockData["update_log"] = array_slice($lockData["update_log"], -20);
    }

    file_put_contents($lockFile, json_encode($lockData, JSON_PRETTY_PRINT));

    try {
        $checklistDirectory = "./usercontent/data/";
        if (!is_dir($checklistDirectory)) {
            mkdir($checklistDirectory);
        }

        file_put_contents($checklistDirectory . "checklist.json", $_POST["checklist_data"]);
        echo jsonState("success", "", "");
        exit;
    } catch (Exception $ex) {
        echo jsonState("error", "other_upload_error", $ex->getMessage());
        exit;
    }
} else {
    // --- FAILURE ---

    $lockData["failures"]++;
    if ($lockData["failures"] == 1) {
        $lockData["timestamp"] = time();
    }

    file_put_contents($lockFile, json_encode($lockData, JSON_PRETTY_PRINT));

    echo jsonState("error", "auth_failed", "Authentication failed");
    exit;
}

// Helper Function
function jsonState($state, $messageCode, $fallbackMessage)
{
    return json_encode([
        "state" => $state,
        "messageCode" => $messageCode,
        "details" => $fallbackMessage
    ]);
}
