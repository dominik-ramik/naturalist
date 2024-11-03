<?php

$credentials_file = ".usercontent/data/credentials.php";

if (file_exists($credentials_file)) {
   include $credentials_file;
}
else {
    echo jsonState("error", "upload_disabled", "upload disabled by administrator");
    die;
}

if ($username == "" || $password == "") {
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
        echo jsonState("error", "other", $ex->getMessage());
        die;
    }
} else {
    echo jsonState("error", "auth_failed", "authentication failed");
    die;
}

function jsonState($state, $messageCode, $fallbackMessage)
{
    return '{"state": "' . $state . '", "messageCode": "' . $messageCode . '", "details": "' . $fallbackMessage . '"}';
}
