# Official PS1 reference pack

`PS1/` is a complete, unmodified snapshot of the upstream PS1 directory, obtained through a sparse Git clone at commit `966c976005db2e3e40a691cff268fdb8f396a5df`. It includes the editable `PS1.drawio` omitted from the previous bundled references. See `provenance.json` for retrieval time and byte-level SHA-256 hashes.

Start with [the brief](PS1/PS1_README.md). `01_data/` contains the eight input CSVs. `03_submission_sample/` belongs to the organisers; our outputs are in [submissions/public/](../submissions/public/).

No runnable official validator is included in this PS1 snapshot. References to `trackaccess` in the brief do not mean that package is available here.

Compared with the old bundled commit `16526c02579c7f37e54eaaa42a4cc6d4ceb19994`, the brief now explicitly specifies predecessor finish-to-start in strictly later weeks and corrects rule numbering. The eight input CSVs are byte-identical. The existing solver already applies that predecessor timing.

To update, clone the upstream repository into a temporary directory, select `PS1` using sparse checkout, review the diff, copy only the PS1 directory, regenerate provenance checksums, and run the tests and public results. Do not edit upstream files to document application assumptions; put those in `docs/PLANNER.md`.
