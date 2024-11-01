<?php

// If you do not wish to use this server-based update feature and are using a static hosting
// please set both the username and the password to "" (empty string) or delete this file completely

$username = "checklist"; // modify the user name between the quotes "..." to match your preferences, the user name needs to be surrounded by quotes
$password = "N@tur5-gr8!"; // modify the password between the quotes "..." to a unique strong password, the password needs to be surrounded by quotes

// ####################################################################################################################

/////////////////////////////////////////
// Do not modify the code below this line
/////////////////////////////////////////

if($username == "" || $password == ""){
    echo jsonState("error", "upload disabled by administrator");
    die;
}

if (strcmp($_POST["username"], $username) == 0 && strcmp($_POST["password"], $password) == 0) {
    try {
        file_put_contents('./data/checklist.json', $_POST["checklist_data"]);
        echo jsonState("success", "");
        die;
    } catch (Exception $ex) {
        echo jsonState("error", $ex->getMessage());
        die;
    }
} else {
    echo jsonState("error", "authentication failed");
    die;
}

function jsonState($state, $details){
    return '{"state": "'.$state.'", "details": "'.$details.'"}';
}