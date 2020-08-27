/* eslint-disable max-len */
import * as macosVersion from "macos-version";
import * as compareVersions from "compare-versions";
import { FileSystem } from "@server/fileSystem";

const osVersion = macosVersion();

/**
 * Builds all the AppleScripts.
 * We need to do it this way due to referencing FileSystem
 */
export const getAppleScripts = () => {
    /**
     * The AppleScript used to send a message with or without an attachment
     */
    const startMessages = {
        name: "startMessages.scpt",
        contents: `set appName to "Messages"
        if application appName is running then
            return 0
        else
            tell application appName to reopen
        end if`
    };

    /**
     * The AppleScript used to send a message with or without an attachment
     */
    const sendMessage = {
        name: "sendMessage.scpt",
        contents: `on run argv
        if (count of argv) >= 2 then
            set chatGuid to item 1 of argv
            set message to item 2 of argv

            tell application "Messages"
                set targetChat to a reference to text chat id chatGuid

                (* Send the attachment first *)
                if (count of argv) > 2 then
                    set theAttachment to (item 3 of argv) as POSIX file
                    send theAttachment to targetChat

                    (* We need this delay or it won't send correctly *)
                    delay 0.5
                end if

                if message is not equal to "" then
                    send message to targetChat
                end if
            end tell

            tell application "System Events" to tell process "Messages" to set visible to false
        end if
    end run`
    };

    /**
     * The AppleScript used to start a chat with some number of participants
     */
    const startChat = {
        name: "startChat.scpt",
        contents: `on run argv
        tell application "Messages"
            set targetService to id of 1st service whose service type = iMessage

            (* Iterate over recipients and add to list *)
            set members to {}
            repeat with targetRecipient in argv
                copy (buddy targetRecipient of service id targetService) to end of members
            end repeat

            (* Start the new chat with all the recipients *)
            set thisChat to make new text chat with properties {participants: members}
            log thisChat

            (* Quick iMessage and re-open it *)
            quit
            delay 0.5
            reopen
        end tell

        tell application "System Events" to tell process "Messages" to set visible to false
    end run`
    };

    /**
     * The AppleScript used to rename a group chat
     */
    const renameGroupChat = {
        name: "renameGroupChat.scpt",
        contents: `on run {currentName, newName}
        tell application "System Events"
            (* Check if messages was in the foreground *)
            set isForeground to false
            tell application "Finder"
                try
                    set frontApp to window 1 of (first application process whose frontmost is true)
                    set winName to name of frontApp
                    if winName is equal to "Messages" then
                        set isForeground to true
                    end if
                end try
            end tell

            tell process "Messages"
                set groupMatch to -1
                
                (* Iterate over each chat row *)
                repeat with chatRow in ((table 1 of scroll area 1 of splitter group 1 of window 1)'s entire contents as list)
                    if chatRow's class is row then
                        
                        (* Pull out the chat's name *)
                        set fullName to (chatRow's UI element 1)'s description
                        set nameSplit to my splitText(fullName, ". ")
                        set chatName to item 1 of nameSplit
                        
                        (* Only pull out groups *)
                        if chatName is equal to currentName then
                            set groupMatch to chatRow
                            exit repeat
                        end if
                    end if
                end repeat
                
                (* If no match, exit *)
                if groupMatch is equal to -1 then
                    tell me to error "Group chat does not exist"
                end if

                (* We have to activate the window so that we can hit enter *)
                tell application "Messages"
                    reopen
                    activate
                end tell
                delay 1
                
                (* Select the chat and rename it *)
                select groupMatch
                try
                    tell window 1 to tell splitter group 1 to tell button "Details"
                        try
                            (* If the popover is open, don't re-click Details *)
                            set popover to pop over 1
                        on error notOpen
                            (* If the popover is not open, click Details *)
                            click
                        end try

                        tell pop over 1 to tell scroll area 1 to tell text field 1
                            set value to newName
                            confirm
                        end tell
                        click
                    end tell
                on error errorMessage
                    tell me to error "execution error: Failed to rename group -> " & errorMessage
                    key code 53
                end try
            end tell

            (* If the window was not in the foreground originally, hide it *)
            if isForeground is equal to false then
                tell application "Finder"
                    set visible of process "Messages" to false
                end tell
            end if
        end tell
    end run

    on splitText(theText, theDelimiter)
        set AppleScript's text item delimiters to theDelimiter
        set theTextItems to every text item of theText
        set AppleScript's text item delimiters to ""
        return theTextItems
    end splitText`
    };

    /**
     * AppleScript to add a participant to a group
     */
    const addParticipant = {
        name: "addParticipant.scpt",
        contents: `on run {currentName, participant}
        tell application "System Events"
            (* Check if messages was in the foreground *)
            set isForeground to false
            tell application "Finder"
                try
                    set frontApp to window 1 of (first application process whose frontmost is true)
                    set winName to name of frontApp
                    if winName is equal to "Messages" then
                        set isForeground to true
                    end if
                end try
            end tell

            tell process "Messages"
                set groupMatch to -1
                
                (* Iterate over each chat row *)
                repeat with chatRow in ((table 1 of scroll area 1 of splitter group 1 of window 1)'s entire contents as list)
                    if chatRow's class is row then
                        
                        (* Pull out the chat's name *)
                        set fullName to (chatRow's UI element 1)'s description
                        set nameSplit to my splitText(fullName, ". ")
                        set chatName to item 1 of nameSplit
                        
                        (* Only pull out groups *)
                        if chatName is equal to currentName then
                            set groupMatch to chatRow
                            exit repeat
                        end if
                    end if
                end repeat
                
                if groupMatch is equal to -1 then
                    tell me to error "Group chat does not exist"
                end if

                (* We have to activate the window so that we can hit enter *)
                tell application "Messages"
                    reopen
                    activate
                end tell
                delay 1
                
                select groupMatch
                try
                    tell window 1 to tell splitter group 1 to tell button "Details"
                        try
                            (* If the popover is open, don't re-click Details *)
                            set popover to pop over 1
                        on error notOpen
                            (* If the popover is not open, click Details *)
                            click
                        end try

                        tell pop over 1 to tell scroll area 1 to tell text field 2
                            set value to participant
                            set focused to true
                            key code 36 -- Enter
                        end tell
                    end tell
                    
                    delay 1
                    set totalWindows to count windows
                    
                    if totalWindows is greater than 1 then
                        repeat (totalWindows - 1) times
                            try
                                tell button 1 of window 1 to perform action "AXPress"
                            on error
                                exit repeat
                            end try
                        end repeat
                        log "Error: Not an iMessage address"
                        return
                    end if
                on error errorMessage
                    log errorMessage
                    return
                end try
                
                key code 53 -- Escape
                log "success"
            end tell

            (* If the window was not in the foreground originally, hide it *)
            if isForeground is equal to false then
                tell application "Finder"
                    set visible of process "Messages" to false
                end tell
            end if
        end tell
    end run

    on splitText(theText, theDelimiter)
        set AppleScript's text item delimiters to theDelimiter
        set theTextItems to every text item of theText
        set AppleScript's text item delimiters to ""
        return theTextItems
    end splitText`
    };

    /**
     * AppleScript to add a participant to a group
     */
    const removeParticipant = {
        name: "removeParticipant.scpt",
        contents: `on run {currentName, address}
        tell application "System Events"
            (* Check if messages was in the foreground *)
            set isForeground to false
            tell application "Finder"
                try
                    set frontApp to window 1 of (first application process whose frontmost is true)
                    set winName to name of frontApp
                    if winName is equal to "Messages" then
                        set isForeground to true
                    end if
                end try
            end tell

            tell process "Messages"
                set groupMatch to -1
                
                (* Iterate over each chat row *)
                repeat with chatRow in ((table 1 of scroll area 1 of splitter group 1 of window 1)'s entire contents as list)
                    if chatRow's class is row then
                        
                        (* Pull out the chat's name *)
                        set fullName to (chatRow's UI element 1)'s description
                        set nameSplit to my splitText(fullName, ". ")
                        set chatName to item 1 of nameSplit
                        
                        (* Only pull out groups *)
                        if chatName is equal to currentName then
                            set groupMatch to chatRow
                            exit repeat
                        end if
                    end if
                end repeat
                
                if groupMatch is equal to -1 then
                    tell me to error "Group chat does not exist"
                end if

                (* We have to activate the window so that we can hit enter *)
                tell application "Messages"
                    reopen
                    activate
                end tell
                delay 1
                
                select groupMatch
                try
                    tell window 1 to tell splitter group 1 to tell button "Details"
                        try
                            (* If the popover is open, don't re-click Details *)
                            set popover to pop over 1
                        on error notOpen
                            (* If the popover is not open, click Details *)
                            click
                        end try

                        tell pop over 1 to tell scroll area 1
                            set contactRow to -1
                            repeat with participant in (table 1's entire contents) as list
                                if participant's class is row then
                                    if name of participant's UI element 1 is equal to address then
                                        set contactRow to participant
                                        exit repeat
                                    end if
                                end if
                            end repeat
                            
                            if contactRow is equal to -1 then
                                key code 53
                                log "Error: Address is not a participant"
                                return
                            end if
                            
                            select contactRow
                            delay 0.1
                            key code 51
                            delay 0.3
                            key code 53
                        end tell
                    end tell

                on error errorMessage
                    log errorMessage
                end try
            
                log "success"
            end tell

            (* If the window was not in the foreground originally, hide it *)
            if isForeground is equal to false then
                tell application "Finder"
                    set visible of process "Messages" to false
                end tell
            end if
        end tell
    end run

    on splitText(theText, theDelimiter)
        set AppleScript's text item delimiters to theDelimiter
        set theTextItems to every text item of theText
        set AppleScript's text item delimiters to ""
        return theTextItems
    end splitText`
    };

    /**
     * AppleScript to send a tap-back
     */
    const toggleTapback = {
        name: "toggleTapback.scpt",
        contents: `on run {realChatName, messageText, reactionIndex}
        tell application "System Events"
            tell process "Messages"
                set groupMatch to -1
                
                (* Iterate over each chat row *)
                repeat with chatRow in ((table 1 of scroll area 1 of splitter group 1 of window 1)'s entire contents as list)
                    if chatRow's class is row then
                        
                        (* Pull out the chat's name *)
                        set fullName to (chatRow's UI element 1)'s description
                        set nameSplit to my splitText(fullName, ". ")
                        set chatName to item 1 of nameSplit
                        
                        (* Only pull out groups *)
                        if chatName is equal to realChatName then
                            set groupMatch to chatRow
                            exit repeat
                        end if
                    end if
                end repeat
                
                (* If no match, exit *)
                if groupMatch is equal to -1 then
                    tell me to error "Group chat does not exist"
                end if
                
                (* We have to activate the window so that we can hit enter *)
                tell application "Messages"
                    reopen
                    activate
                end tell
                delay 1
                
                (* Select the chat and rename it *)
                select groupMatch
                tell window 1 to tell splitter group 1
                    set previousRow to null
                    (* Get the text messages as a list and reverse it to get newest first *)
                    set chatItems to reverse of (entire contents of scroll area 2 as list)
                    
                    (* Iterate over all the messages *)
                    repeat with n from 1 to count of chatItems
                        set chatRow to (item n of chatItems)
                        
                        (* Check the types of the current row and previous row *)
                        if chatRow's class is static text and previousRow's class is group then
                            set textValue to chatRow's value
                            log textValue
                            (* Compare the text with what we are looking for *)
                            if textValue is equal to messageText then
                                select chatRow
                                tell previousRow to perform action "AXShowMenu"
                                delay 0.5
                                key code 125
                                keystroke return
                                delay 2.0
                                
                                (* Re-fetch the rows so we can get the tapback row *)
                                set newRows to reverse of (entire contents of scroll area 2 as list)
                                set tapBack to item (n + 1) of newRows
                                if tapBack's class is not radio group then
                                    set tapBack to item (n - 1) of newRows
                                end if
                                tell radio button (reactionIndex as number) of tapBack to perform action "AXPress"
                                delay 0.5
                                keystroke return
                                
                                return
                            end if
                        end if
                        
                        set previousRow to chatRow
                    end repeat
                end tell
            end tell
        end tell
    end run

    on splitText(theText, theDelimiter)
        set AppleScript's text item delimiters to theDelimiter
        set theTextItems to every text item of theText
        set AppleScript's text item delimiters to ""
        return theTextItems
    end splitText`
    };

    /**
     * Checks if a typing indicator is present
     */
    const checkTypingIndicator = {
        name: "checkTypingIndicator.scpt",
        contents: `on run {realChatName}
        tell application "System Events"
            set isTyping to false
            tell process "Messages"
                set groupMatch to -1
                
                (* Iterate over each chat row *)
                repeat with chatRow in ((table 1 of scroll area 1 of splitter group 1 of window 1)'s entire contents as list)
                    if chatRow's class is row then
                        
                        (* Pull out the chat's name *)
                        set fullName to (chatRow's UI element 1)'s description
                        set nameSplit to my splitText(fullName, ". ")
                        set chatName to item 1 of nameSplit
                        
                        (* Only pull out groups *)
                        if chatName is equal to realChatName then
                            set groupMatch to chatRow
                            exit repeat
                        end if
                    end if
                end repeat
                
                (* If no match, exit *)
                if groupMatch is equal to -1 then
                    tell me to error "Group chat does not exist"
                end if
                
                (* Select the chat and rename it *)
                select groupMatch
                tell window 1 to tell splitter group 1
                    set previousRow to null
                    (* Get the text messages as a list and reverse it to get newest first *)
                    set chatItems to reverse of (entire contents of scroll area 2 as list)
                    
                    (* Check the 7th item. If it's an image, then it's the typing indicator *)
                    set typingEl to (item 7 of chatItems)
                    if typingEl's class is image then
                        set isTyping to true
                    end if
                end tell
            end tell
            
            (* Return true/false *)
            log isTyping
        end tell
    end run

    on splitText(theText, theDelimiter)
        set AppleScript's text item delimiters to theDelimiter
        set theTextItems to every text item of theText
        set AppleScript's text item delimiters to ""
        return theTextItems
    end splitText`
    };

    let contactsApp = "Contacts";
    // If the OS Version is earlier than or equal to 10.7.0, use "Address Book"
    if (osVersion && compareVersions(osVersion, "10.7.0") <= 0) contactsApp = "Address Book";

    /**
     * Export contacts to a VCF file
     */
    const exportContacts = {
        name: "exportContacts.scpt",
        contents: `set contactsPath to POSIX file "${FileSystem.contactsDir}/AddressBook.vcf" as string
        
        -- Remove any existing back up file (if any)
        tell application "Finder"
            if exists (file contactsPath) then
                delete file contactsPath -- move to trash
            end if
        end tell
        
        tell application "${contactsApp}"
            reopen

            -- Create an empty file
            set contactsFile to (open for access file contactsPath with write permission)
            
            try
                repeat with per in people
                    write ((vcard of per as text) & linefeed) to contactsFile
                end repeat
                close access contactsFile
            on error
                close access contactsFile
            end try
        end tell`
    };

    return [
        sendMessage,
        startChat,
        renameGroupChat,
        addParticipant,
        removeParticipant,
        startMessages,
        toggleTapback,
        checkTypingIndicator,
        exportContacts
    ];
};