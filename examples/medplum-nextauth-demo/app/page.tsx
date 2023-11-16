import {options} from "./api/auth/[...nextauth]/options"
import {getServerSession} from "next-auth/next"
import {MedplumClient} from '@medplum/core';
import {PatientTable} from "@/components/PatientTable";

interface Session {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string;
  };
}

interface FormattedPatient {
  id: string | undefined;
  name: string | undefined;
  family: string | undefined;
}

export default async function Home() {
  let formattedPatients: FormattedPatient[] = [];
  const session: Session | null = await getServerSession(options);
  const token = session?.accessToken;

  try {
    const medplum = new MedplumClient({
      accessToken: token,
    });
    const bundle = await medplum.search('Patient', 'name=Mr*');
    formattedPatients = bundle.entry?.map((item): FormattedPatient => ({
      id: item.resource?.id,
      name: item.resource?.name?.[0].given?.[0],
      family: item.resource?.name?.[0].family,
    })) ?? [];
  } catch (err) {
    console.log(err);
  }

  return (
    <div className="flex">
      <main className='ml-5 w-full'>
        {session ? (
          <PatientTable patients={formattedPatients}/>
        ) : (
          <h2>
            Not signed in <a href="/api/auth/signin">Sign in</a>
          </h2>
        )}
      </main>
    </div>
  )
}
