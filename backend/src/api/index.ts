import { Router } from "express";
import uploadRoute from "@/api/upload.route";
import videoRoute from "@/api/video.route";

const router = Router();

router.use(uploadRoute);
router.use(videoRoute);

export default router;
