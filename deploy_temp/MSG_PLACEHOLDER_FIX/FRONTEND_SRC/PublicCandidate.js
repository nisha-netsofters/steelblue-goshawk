import React, { useState, useRef, useEffect } from "react";
import {
  Button,
  Col,
  Container,
  Modal,
  ModalBody,
  ModalHeader,
  Row,
} from "reactstrap";
import Basic from "./../../components/Forms/Public/Basic";
import Attachment_File from "./../../components/Forms/Public/Attachment_File";
import { Address } from "./../../components/Forms/Public/Address";
import Professional from "./../../components/Forms/Public/Professional";
import actions from "../../redux/jobOpening/actions";
import fileUploadactions from "../../redux/fileUploadProgress.js/actions";
import { useDispatch, useSelector } from "react-redux";
// import logo from "../../assets/images/logo/unique.png";
import CandidateActions from "../../redux/candidate/actions";
import Wizard from "./../../@core/components/wizard/index";
import ReactCanvasConfetti from "react-canvas-confetti";
import ComponentSpinner from "../../@core/components/spinner/Loading-spinner";
import { toast } from "react-toastify";
import { useLocation } from "react-router-dom";
import JobDescription from "../../components/Forms/JobOpening/JobDescription";
import CandidateCheck from "../../components/Forms/Public/CandidateCheck";
// import { uploadFiles } from './../../helper/fileUpload'
import Marquee from "react-fast-marquee";
import { Country, State, City } from "country-state-city";
import {
  useHistory,
  useParams,
} from "react-router-dom/cjs/react-router-dom.min";
import { getAgencyDetailBySlugPublic } from "../../apis/agency";
import { getPublicCandidateForApplyAPI } from "../../apis/candidate";
// import awsUploadAssets from '../../helper/awsUploadAssets'

const canvasStyles = {
  position: "fixed",
  pointerEvents: "none",
  width: "100%",
  height: "100%",
  top: 0,
  left: 0,
};

const PublicCandidate = () => {
  const { jobOpening, progress } = useSelector((state) => state);
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation().search;
  const jobOpeningId = new URLSearchParams(location).get("id");
  const userId = new URLSearchParams(location).get("user");
  const editCandidateId = new URLSearchParams(location).get("cid");
  const getCandidateRes = useSelector((state) => state.candidate);
  const ref = useRef(null);
  const [candidate, setCandidate] = useState([]);
  const [pointerEvents, setPointerEvents] = useState("fill");
  const [professional, setProfessional] = useState([]);
  const [animation, setAnimation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepper, setStepper] = useState(null);
  const [mobile, setMobile] = useState("");
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState("");
  const [disabled, setDisabeled] = useState(false);
  const [open, setOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [industries_relation, setIndustries_relation] = useState([]);
  const [cities, setCities] = useState([]);
  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState();
  const [selectedCity, setSelectedCity] = useState();
  const [update, setUpdate] = useState(false);
  const [gender, setGender] = useState();
  const [logo, setLogo] = useState(null);
  const [agncyid, setagncyid] = useState();
  const params = useParams();
  useEffect(() => {
    (async () => {
      const resp = await getAgencyDetailBySlugPublic(params?.slug);
      if (resp?.id) {
        setCandidate({
          ...candidate,
          agencyId: resp?.id,
        });
        setagncyid(resp?.id);
      } else {
        history.push("/*");
        return;
      }
      if (resp?.logo) {
        setLogo(resp?.logo);
      }

      // WhatsApp registration/edit link: /{slug}/candidate/apply?cid=...
      if (editCandidateId) {
        try {
          const loaded = await getPublicCandidateForApplyAPI(
            editCandidateId,
            params?.slug
          );
          const data = loaded?.data || loaded;
          if (data?.id) {
            setCandidate({
              ...data,
              agencyId: resp?.id || data.agencyId,
            });
            setUpdate(true);
            setVerified(true);
            setDisabeled(false);
            if (data.mobile) setMobile(String(data.mobile));
            if (data.email) setEmail(String(data.email));
            if (data.professional) setProfessional(data.professional);
            if (Array.isArray(data.industries_relation)) {
              setIndustries_relation(data.industries_relation);
            }
          }
        } catch (err) {
          toast.error("Could not load candidate for edit");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (candidate?.gender) {
      let label = "Male";
      if (candidate?.gender === "female") label = "Female";
      setGender({ value: [candidate.gender], label });
      if (candidate?.gender === "male") label = "Male";
      setGender({ value: [candidate.gender], label });
    }
  }, [candidate]);
  useEffect(() => {
    const getStates = async () => {
      try {
        const result = await State.getStatesOfCountry("IN");
        setStates(result);
      } catch (error) {
        setStates([]);
      }
    };

    getStates();
  }, []);

  useEffect(() => {
    const getCities = async () => {
      try {
        const result = await City.getCitiesOfState(
          "IN",
          selectedState?.isoCode
        );
        setCities(result);
      } catch (error) {
        setCities([]);
      }
    };

    getCities();
  }, [selectedState]);

  useEffect(() => {
    if (jobOpeningId?.length > 0) {
      setOpen(true);
      dispatch({
        type: actions.FIND_BY_ID_JOBOPENING,
        payload: jobOpeningId,
      });
      setDisabeled(true);
    }
  }, []);
  useEffect(() => {
    setCandidate((prev) => ({
      ...(Array.isArray(prev) ? {} : prev || {}),
      email,
      mobile,
      agencyId: agncyid,
    }));
  }, [email, mobile, agncyid]);

  const handleChange = (e) => {
    const patch = (fields) =>
      setCandidate((prev) => ({
        ...(Array.isArray(prev) ? {} : prev || {}),
        ...fields,
      }));

    if (e?.key == "state") {
      patch({ state: e.value, stateId: e.isoCode });
    } else if (e?.key == "city") {
      patch({ city: e.value, cityId: e.value });
    } else if (e?.target?.id === undefined) {
      patch({ [e.id]: e.value });
    } else if (e.target.id === "street") {
      patch({ [e.target.id]: e.target.value });
    } else if (e.target.id === "email") {
      patch({ email: e.target.value.toLowerCase() });
    } else if (e.target.id === "mobile" || e.target.id === "alternateMobile") {
      patch({
        [e.target.id]: e.target.value.replace(/\D/g, "").slice(0, 10),
      });
    } else {
      patch({
        [e.target.id]: e.target.value.replace(/[^a-z ]/gi, ""),
      });
    }
  };

  const fileOnChangeHandler = () => {
    if (progress?.image) {
      setCandidate((prev) => ({
        ...(Array.isArray(prev) ? {} : prev || {}),
        image: progress?.uploadedLink,
      }));
    }
    if (progress?.resume) {
      setCandidate((prev) => ({
        ...(Array.isArray(prev) ? {} : prev || {}),
        resume: progress?.uploadedLink,
      }));
    }
    dispatch({
      type: fileUploadactions.CLEAR_PROGRESS,
    });
  };

  useEffect(() => {
    // Any create/update response should unlock the UI (success or duplicate error)
    if (
      getCandidateRes == null ||
      (typeof getCandidateRes === "object" &&
        !Object.keys(getCandidateRes || {}).length)
    ) {
      return;
    }

    setPointerEvents("fill");
    setLoading(false);
  }, [getCandidateRes]);

  useEffect(() => {
    if (getCandidateRes?.createPublicCandidatePopup) {
      setTimeout(() => {
        toast.success("Form Succesfuly Submited");
      }, 20);
      setIsSuccess(true);
      setAnimation({});
    }
  }, [getCandidateRes?.createPublicCandidatePopup]);

  const CandidateHandler = async () => {
    setLoading(true);
    setPointerEvents("none");
    if (update == true) {
      delete candidate.interviews;
      delete candidate.professional;
      delete candidate.industries_relation;
      const typeResume = typeof candidate?.resume;
      const typeImage = typeof candidate?.image;

      if (typeImage === "object" && candidate?.image !== null) {
        // const resp = await uploadFiles(candidate?.image)
        // candidate.image = `https:${resp.url}`
        const resp = await awsUploadAssetsWithResp(candidate?.image);
        candidate.image = `${resp.url}`;
      }

      if (typeResume === "object" && candidate?.resume !== null) {
        // const resp = await uploadFiles(candidate?.resume)/
        // candidate.resume = `https:${resp.url}`
        const resp = await awsUploadAssetsWithResp(candidate?.resume);
        candidate.resume = `${resp.url}`;
      }

      const fm = new FormData();
      for (const key in candidate) {
        fm.append(key, candidate[key]);
      }
      if (industries_relation?.length > 0) {
        fm.append("industries_relation", JSON.stringify(industries_relation));
      }
      if (professional?.length !== 0)
        fm.append("professional", JSON.stringify(professional));
      if (jobOpeningId) {
        fm.append("jobOpeningId", jobOpeningId);
        fm.append("userId", userId);
      }
      await dispatch({
        type: CandidateActions.UPDATE_CANDIDATE_PUBLIC,
        payload: { id: candidate.id, data: fm },
      });
    } else {
      const fm = new FormData();
      for (const key in candidate) {
        fm.append(key, candidate[key]);
      }
      if (industries_relation?.length > 0) {
        fm.append("industries_relation", JSON.stringify(industries_relation));
      }
      if (professional?.length !== 0)
        fm.append("professional", JSON.stringify(professional));
      if (jobOpeningId) {
        fm.append("jobOpeningId", jobOpeningId);
        fm.append("userId", userId);
      }
      dispatch({
        type: CandidateActions.CREATE_PUBLIC_CANDIDATE,
        payload: { data: fm },
      });
    }
    // if (candidate?.image) {
    //   await awsUploadAssets(candidate?.image, "image", dispatch)
    // }
    // if (candidate?.resume) {
    //   await awsUploadAssets(candidate?.resume, "resume", dispatch)
    // }
  };

  const steps = [
    {
      id: "attachment",
      title: "Attachment",
      subtitle: "Upload Resume & Auto Extract",
      content: (
        <Attachment_File
          loading={loading || false}
          candidate={candidate}
          setCandidate={setCandidate}
          setEmail={setEmail}
          setMobile={setMobile}
          setGender={setGender}
          setProfessional={setProfessional}
          CandidateHandler={CandidateHandler}
          fileOnChangeHandler={fileOnChangeHandler}
          stepper={stepper}
          isFirstStep
        />
      ),
    },
    {
      id: "candidate-check",
      title: "Verify Candidate",
      subtitle: "Enter Your candidate Details.",
      content: (
        <CandidateCheck
          setCandidate={setCandidate}
          update={update}
          setUpdate={setUpdate}
          setLoading={setLoading}
          setDisabeled={setDisabeled}
          email={email}
          setEmail={setEmail}
          mobile={mobile}
          setVerified={setVerified}
          verified={verified}
          setMobile={setMobile}
          stepper={stepper}
        />
      ),
    },
    {
      id: "basic-details",
      title: "Basic Details",
      subtitle: "Enter Your Basic Details.",
      content: (
        <Basic
          gender={gender}
          setGender={setGender}
          disabled={disabled}
          candidate={candidate}
          setCandidate={setCandidate}
          handleChange={handleChange}
          stepper={stepper}
          email={email}
          mobile={mobile}
        />
      ),
    },
    {
      id: "step-address",
      title: "Address",
      subtitle: "Add Address",
      content: (
        <Address
          selectedCity={selectedCity}
          setSelectedCity={setSelectedCity}
          cities={cities}
          states={states}
          selectedState={selectedState}
          setSelectedState={setSelectedState}
          setCandidate={setCandidate}
          candidate={candidate}
          handleChange={handleChange}
          stepper={stepper}
        />
      ),
    },
    {
      id: "professional",
      title: "Professional",
      subtitle: "Add Professional Details",
      content: (
        <Professional
          professional={professional}
          industries_relation={industries_relation}
          setIndustries_relation={setIndustries_relation}
          disabled={disabled}
          jobOpeningId={jobOpeningId}
          jobOpeningIndustries={jobOpening?.industries}
          setProfessional={setProfessional}
          handleChange={handleChange}
          stepper={stepper}
          candidate={candidate}
          CandidateHandler={CandidateHandler}
          loading={loading}
          isFinalStep
        />
      ),
    },
  ];

  // function importAll(r) {
  //   return r.keys().map(r);
  // }

  // const images = importAll(
  //   require.context("../../assets/images/Clients", false, /\.(png|jpe?g|svg)$/)
  // );
  const { slug } = useParams();

  return (
    <>
      <div className="container-sm container-md container-lg container-xl">
        <ReactCanvasConfetti
          fire={animation}
          particleCount={500}
          angle={90}
          spread={360}
          startVelocity={100}
          decay={0.8}
          gravity={-0.1}
          origin={{ x: 0.5, y: 0.5 }}
          shapes={"circle"}
          scalar={1}
          zIndex={-1}
          disableForReducedMotion={false}
          resize={true}
          useWorker={true}
          height={window.innerHeight}
          width={window.innerWidth}
          style={canvasStyles}
        />
        <Row className="gy-1 pt-100 mt-2">
          <Col className="col" style={{ textAlign: "center" }}>
            {logo && (
              <img
                className="img-fluid"
                src={logo}
                style={{ maxHeight: "100px", margin: 0, maxWidth: "180px" }}
              />
            )}
            <h1 style={{ color: "#105996" }}>Candidate Registration</h1>
            {/* {/ {verified ? <h1>Candidate Detail</h1> : null} /} */}
          </Col>
        </Row>
        <div style={{ display: "flex", justifyContent: "center" }}>
          We are Specialized In Recruitment Services (Free of Cost for
          Candidates)
        </div>
        {loading === true ? (
          <>
            <div className="loader">
              <ComponentSpinner>
                <h1>Please Wait ...</h1>
              </ComponentSpinner>
            </div>
          </>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "30px",
          }}
        >
          <div
            style={{
              opacity: pointerEvents === "fill" ? 1 : 0.3,
              pointerEvents,
            }}
          >
            <Wizard instance={(el) => setStepper(el)} ref={ref} steps={steps} />
          </div>
        </div>
        {/* <div className="mb-2 mt-2 p-1 container-sm container-md container-lg container-xl">
          <div
            style={{
              fontWeight: "800",
              fontSize: "20px",
              display: "flex",
              justifyContent: "center",
              marginBottom: "25px",
            }}
          >
            Our Clients
          </div>
          <Marquee className="marquee-slider">
            {images?.map((ele) => (
              <img src={ele} alt="client-photo" style={{ height: "100px" }} />
            ))}
          </Marquee>
        </div> */}
        {jobOpeningId ? (
          <>
            <JobDescription
              setOpen={setOpen}
              verified={verified}
              open={open}
              jobOpening={jobOpening}
              setVerified={setVerified}
              email={email}
              setEmail={setEmail}
              mobile={mobile}
              setMobile={setMobile}
              jobOpeningId={jobOpeningId}
            />
          </>
        ) : (
          <>
            {/* {/ <CandidateCheck setDisabeled={setDisabeled} email={email} setEmail={setEmail} mobile={mobile} setVerified={setVerified} verified={verified} setMobile={setMobile} /> /} */}
          </>
        )}
        <Modal isOpen={isSuccess} className="modal-dialog-centered">
          <ModalHeader
            className="bg-transparent"
            // onClick={() => onClickHandler()}
            toggle={() => {
              dispatch({
                type: CandidateActions?.CREATE_PUBLIC_CANDIDATE_POPUP,
                payload: false,
              });
              setIsSuccess(!isSuccess);
              window.location.href = `/${slug}/candidate/apply`;
            }}
          ></ModalHeader>
          <ModalBody>
            <h1 className="text-center mb-1" style={{ color: "#105996" }}>
              Congratulations!!
            </h1>
            <p className="text-center">
              {" "}
              Your registration has been completed successfully. You may now access and
              apply for available job opportunities.
            </p>
            <p className="text-center">
              Thank you for registering. Your profile has been created successfully.
            </p>
            {/* <p className="text-center">
              You can Click on this whatsApp Group Link{" "}
              <a
                href="https://chat.whatsapp.com/D7ltDYardBM34UCq2qCpih"
                style={{ color: "#105996" }}
              >
                https://chat.whatsapp.com
              </a>{" "}
              and join with us where you can get only regular free New Job
              Openings so if you join this its advantaged for you.
            </p> */}
          </ModalBody>
        </Modal>
      </div>
    </>
  );
};

export default PublicCandidate;
