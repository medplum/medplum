# Vouched (and denounced) contributors for this repository, used by the
# "Vouch" GitHub Actions workflows (.github/workflows/vouch-*.yml) to decide
# who can open issues/PRs without extra scrutiny.
#
# - Vouched users' PRs are never required to link to a correctly
#   labeled issue; everyone else's are (see vouch-check-pr.yml).
# - Denounced users have their issues and PRs closed automatically,
#   regardless of anything else (see vouch-check-issue.yml / vouch-check-pr.yml).
#
# This file is largely managed automatically: vouch-sync-codeowners.yml
# (run manually via the Actions UI) expands the teams in .github/CODEOWNERS
# into individual users and adds them here as vouched. It only ever adds
# entries -- it won't remove someone just because they left a team, and it
# will replace a denounced entry with a vouched one if that person is (or
# becomes) a codeowner. Entries can also be added/edited by hand, e.g. to
# vouch someone who isn't a codeowner, or to denounce someone.
#
# See https://github.com/mitchellh/vouch for the tool this file feeds.
#
# Syntax:
#   - One handle per line (without @), sorted alphabetically.
#   - Optional platform prefix: platform:username (e.g., github:user).
#   - Denounce with a minus prefix: -username or -platform:username.
#   - Optional free-text details after a space following the handle
#     (e.g. a reason for denouncement).
alexanderxlin
amcgivern prior contributions
andystoneman
codyebberson
deam65
dillonstreator prior contributions
everett-williams
filupnot
finnbergquist
ianplunkett
jdjkelly prior contributions
kevinwadeshaw
maddyli
mattlong
mattwiller
medplumbot
noahsilas
oleg-mp
rahul1 prior contributions
reshmakh
techdavidy
thatonebro
the-alchemist
timray721
