<?php

if (isset($_GET["ping"])){
    echo jsonState("online", "", "");
}

$credentials_file = "./usercontent/identity/credentials.php";

$upload_disabled = true;

if (file_exists($credentials_file)) {
    include $credentials_file;

    if ($username != "" && $password != "") {
        $upload_disabled = false;
    }
    else{
        $upload_disabled = true;
    }
}
else{
    $upload_disabled = true;
}

if ($upload_disabled) {
    echo jsonState("error", "upload_disabled", "upload disabled by administrator");
    die;
}

if (!isset($_POST["username"]) || !isset($_POST["password"])) {
    echo jsonState("error", "no_credentials_received", "no credentials received");
    die;
}

if (strcmp($_POST["username"], $username) == 0 && strcmp($_POST["password"], $password) == 0) {
    try {
        $checklistDirectory = "./usercontent/data/";
        if (!is_dir($checklistDirectory)) {
            mkdir($checklistDirectory);
        }

        file_put_contents($checklistDirectory . "checklist.json", $_POST["checklist_data"]);
        echo jsonState("success", "", "");
        die;
    } catch (Exception $ex) {
        echo jsonState("error", "other_upload_error", $ex->getMessage());
        die;
    }
} else {
    echo jsonState("error", "auth_failed", "authentication failed");
    die;
}

function jsonState($state, $messageCode, $fallbackMessage)
{
    echo '{"state": "' . $state . '", "messageCode": "' . $messageCode . '", "details": "' . $fallbackMessage . '"}';
    die;
}

header('Content-Type: application/json');

if (!isset($_GET['url'])) {
    echo json_encode(['error' => 'URL parameter is required']);
    exit;
}

$url = filter_var($_GET['url'], FILTER_VALIDATE_URL);

if (!$url) {
    echo json_encode(['error' => 'Invalid URL']);
    exit;
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_NOBODY, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // Follow redirects
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Skip SSL verification for simplicity

$response = curl_exec($ch);

if ($response === false) {
    echo json_encode(['error' => 'Failed to fetch URL']);
    exit;
}

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentLength = curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);

curl_close($ch);

if ($httpCode !== 200) {
    echo json_encode(['error' => 'Request failed', 'statusCode' => $httpCode]);
    exit;
}

echo json_encode(['contentLength' => $contentLength, 'statusCode' => $httpCode]);