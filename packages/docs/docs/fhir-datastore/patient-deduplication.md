# Patient Deduplication

This guide will go over some choices to consider when architecting a patient de-duplication pipeline in Medplum. 

## Archictecture

Depend on:  

* Prevalence of duplicates

* Likelihood to un-do

* Longevity of source systems

* incremental vs. batch updates

  

## Matching Rules

The best deduplication systems use a library of matching rules with different strengths and weaknesses. While the effectiveness of various patient matching rules will vary depending on the clinical context, here we suggest some rules to get you started. These have been trialed in previous deduplication projects, and are rated by their false positive (incorrect match) and false negative (missed matches) rates.

1. **Exact match on name, gender, email address or phone number: ** We recommend starting here. Email and phone act as "pseudo-unique" identifiers, and have a very low false positive rate, though they are most likely to have false negatives. Using name and gender help eliminate false positives caused by family members sharing the same contact info. Note that phone numbers should be normalized.
2. **Exact match on first name, last name, date of birth,  and postal code:** These matches have a high probability of being true positives, and can be used without email or phone number. Not that false positives can still occur - we recommend human review of these matches.
3. **Phonetic match first match on first and last name, date of birth, and postal code:** Phonetic matching algorithms such as [Soundex](https://en.wikipedia.org/wiki/Soundex) or [Metaphone](https://en.wikipedia.org/wiki/Metaphone) can be used to increase the match rate on names and accounts for transcription error. Alternatively, setting a threshold on the [edit distance](https://en.wikipedia.org/wiki/Levenshtein_distance) between the names.
4. **Phonetic match first name, date of birth: ** This rule excludes last names, to account for patients who change their names (e.g. after getting married). It also exlcudes address information to account for patients who move. While this rule will catch more matches, it has a significantly higher false positive rate, and should definitely be coupled with human review.
5. **Machine Learning:** After you have built up a dataset of (patient, patient) candidate matches that have been reviewed by a human, you are in a

