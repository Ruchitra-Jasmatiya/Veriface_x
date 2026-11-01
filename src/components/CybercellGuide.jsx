import "./Forensic.css";

// Static guidance only. This component submits nothing and makes no claim about
// what authorities will do with a complaint.
const CybercellGuide = () => (
  <section className="fx-guide" id="report-cybercrime">
    <h2>Reporting manipulated or abusive images</h2>
    <p>
      If an image of you or someone else has been altered or created with AI to deceive, defame, or sexualise
      the person shown, you can report it to India's National Cyber Crime Reporting Portal.
    </p>

    <div className="fx-caution">
      <strong>Before you report:</strong> this website's result is an automated indicator. It is useful evidence,
      not a legal finding. Keep the original file and the report, and avoid sharing the image further.
    </div>

    <h3 style={{ color: "#fff" }}>Steps</h3>
    <ol>
      <li>Save the original file exactly as you received it. Do not edit or re-save it.</li>
      <li>Download the VeriFace-X report for the image (the record ID and SHA-256 identify the file).</li>
      <li>
        Record where you found it: the web address, the platform, the account name, and the date and time you saw it.
      </li>
      <li>
        Go to <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>,
        choose "Report Cyber Crime", and fill in the form with the details above. Attach the original file and the report.
      </li>
      <li>
        For urgent help or financial fraud, call the national cyber helpline <strong>1930</strong>.
      </li>
      <li>
        You can also file a First Information Report (FIR) at your local police station. Take a printed copy of your
        complaint and the reference number.
      </li>
      <li>
        Ask the platform hosting the image to remove it. Most platforms have a report or "non-consensual intimate
        imagery" option.
      </li>
    </ol>

    <h3 style={{ color: "#fff" }}>Things to keep in mind</h3>
    <ul>
      <li>Relevant provisions of the Information Technology Act, 2000 and the Bharatiya Nyaya Sanhita may apply. Which ones depends on the facts, so a police officer or lawyer should confirm them.</li>
      <li>VeriFace-X does not submit complaints on your behalf and cannot contact authorities.</li>
      <li>If the image is sexual or intimate, do not share it to "prove" it. Report it and keep the link only.</li>
    </ul>

    <p className="fx-muted">
      This page is general information, not legal advice. Official portal: <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>.
    </p>
  </section>
);

export default CybercellGuide;
