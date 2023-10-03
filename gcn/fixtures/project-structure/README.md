# JSON specification

This `.json` specification provides rules for `project-structure` testing suit. It is composed of two sections that test file/directory presence and regex matching of file contents.

## Section `structure`

This section is used for testing the following:

1. File/Directory is present 
2. File/Directory is absent
3. Given path is a Directory or a file

The following snippet is a `.json` specification of rules that check if `gradlew` file is present and if `pom.xml` is absent.

```json
{
    "structure": {
        "contains": [
            {
                "path": "./gradlew",
                "type": "file"
            },
        ],
        "-contains": [
            {
                "path": "./pom.xml"
            }
        ]
    }
}
```

## Section `contents`

This section is used for matching regex expression against file contents. For each given path the following is checked (in order given):

1. Path exists
2. Given path is a file
3. Regex matched to file contents

The following snippet illustrates if the word `oraclecloud` is present in file `Application.java`:

```json
{
    "contents": {
        "contains": [
            {
                "path": "./oci/src/main/java/com/example/Application.java",
                "match": "oraclecloud"
            }
        ]
    }
}
```