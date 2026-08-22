import Link from "next/link";
import { buttonClassName } from "../Button";
import type { Farm } from "../../lib/types";
import styles from "./FarmCollection.module.css";

const thaiDate = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

function updatedLabel(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "ไม่พบวันที่แก้ไข" : thaiDate.format(parsed);
}

function FarmMetadata({ farm, organizationName }: { farm: Farm; organizationName?: string }) {
  return (
    <dl className={styles.metadata}>
      <div>
        <dt>จังหวัด</dt>
        <dd>{farm.province ?? "ยังไม่ได้ระบุ"}</dd>
      </div>
      <div>
        <dt>องค์กร</dt>
        <dd>{organizationName ?? "ยังไม่พบชื่อองค์กร"}</dd>
      </div>
      <div>
        <dt>แก้ไขล่าสุด</dt>
        <dd>
          <time dateTime={farm.updated_at}>{updatedLabel(farm.updated_at)}</time>
        </dd>
      </div>
    </dl>
  );
}

export function FarmCollection({
  farms,
  organizationNames
}: {
  farms: Farm[];
  organizationNames: Record<string, string>;
}) {
  return (
    <section aria-labelledby="farm-collection-heading">
      <h2 id="farm-collection-heading" className={styles.visuallyHidden}>
        รายการฟาร์มที่เข้าถึงได้
      </h2>

      <div className={styles.tableViewport}>
        <table className={styles.table}>
          <caption>รายการฟาร์มที่เข้าถึงได้ เรียงตามข้อมูลที่บริการส่งกลับ</caption>
          <thead>
            <tr>
              <th scope="col">ชื่อฟาร์ม</th>
              <th scope="col">จังหวัด</th>
              <th scope="col">องค์กร</th>
              <th scope="col">แก้ไขล่าสุด</th>
              <th scope="col"><span className={styles.visuallyHidden}>การทำงาน</span></th>
            </tr>
          </thead>
          <tbody>
            {farms.map((farm) => (
              <tr key={farm.id}>
                <th scope="row">
                  <Link href={`/farms/${farm.id}`} className={styles.nameLink}>
                    {farm.name}
                  </Link>
                </th>
                <td>{farm.province ?? "ยังไม่ได้ระบุ"}</td>
                <td>{organizationNames[farm.organization_id] ?? "ยังไม่พบชื่อองค์กร"}</td>
                <td><time dateTime={farm.updated_at}>{updatedLabel(farm.updated_at)}</time></td>
                <td className={styles.actionCell}>
                  <Link
                    href={`/farms/${farm.id}`}
                    className={buttonClassName({ variant: "secondary", size: "sm" })}
                  >
                    เปิดฟาร์ม
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.cards} aria-label="รายการฟาร์มที่เข้าถึงได้">
        {farms.map((farm) => (
          <li key={farm.id} className={styles.card}>
            <Link href={`/farms/${farm.id}`} className={styles.cardName}>
              {farm.name}
            </Link>
            <FarmMetadata farm={farm} organizationName={organizationNames[farm.organization_id]} />
            <Link
              href={`/farms/${farm.id}`}
              className={buttonClassName({ variant: "secondary", className: styles.cardAction })}
            >
              เปิดฟาร์ม
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
